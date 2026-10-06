import {
  inferMediaKind,
  type MediaBackend,
  type MediaFrame,
  type MediaKind,
  type MediaMetadata,
  type MediaSource,
} from '../media';
import { MediaFrameCache, TIME_EPSILON } from '../media-cache';
import { MediaFrameScheduler } from '../media-scheduler';
import type { Composition, Layer } from '../model';
import { createMediaBackend } from '../webcodecs-media';
import type { FrameProvider, MediaStatus, ResolvedFrame } from './frame-provider';
import { computeMediaTime } from './media-time';

/** For frames that do not report a duration: how far from its timestamp a frame is still shown. */
const DISPLAY_TOLERANCE = 1 / 48;
const SETTLE_EPSILON = 1e-4;

/** Used to step past a frame that reports no duration. */
const FALLBACK_FRAME_DURATION = 1 / 30;
/** Two consecutive resolves further apart than this (or going backwards) mean the playhead jumped. */
const DISCONTINUITY_JUMP = 0.25;

export const DEFAULT_LOOKAHEAD_SECONDS = 0.5;
export const DEFAULT_FRAME_BUDGET_BYTES = 256 * 1024 * 1024;
export const DEFAULT_MAX_FRAMES_PER_SOURCE = 48;

interface MediaEntry {
  url: string;
  kind: MediaKind;
  status: MediaStatus;
  error?: string;
  source: MediaSource | null;
  metadata: MediaMetadata | null;
  /** One scheduler (and cache) per source: frames of different clips must never mix. */
  scheduler: MediaFrameScheduler;
  ready: Promise<void>;
  still: MediaFrame | null;
  /** Serializes decodes: a single HTMLVideoElement cannot seek to two places at once. */
  chain: Promise<unknown>;
  inFlight: boolean;
  wanted: number | null;
  /** Last media time a decode finished for. Asking again would return the same frame, so we don't. */
  settled: number | null;
  /** Media time the renderer last asked for; decode-ahead runs relative to it. */
  playhead: number | null;
  /** Media time up to which frames were decoded ahead without a gap (-Infinity: nothing yet). */
  aheadUntil: number;
  aheadRunning: boolean;
  /** Bumped whenever decode-ahead must stop (pause, seek, release). */
  aheadEpoch: number;
}

export interface MediaControllerOptions {
  backend?: MediaBackend;
  /** Frame-count cap per source; the byte budget is normally what binds. */
  maxCachedFramesPerSource?: number;
  /** Memory for decoded frames across all sources, in bytes. Split evenly between open video sources. */
  maxCacheBytes?: number;
  /** How far ahead of the playhead to decode while playing. 0 disables decode-ahead. */
  lookaheadSeconds?: number;
}

export interface MediaCacheStats {
  /** Open video sources that hold a frame cache. */
  sources: number;
  frames: number;
  bytes: number;
  budgetBytes: number;
}

function kindForLayer(layer: Layer): MediaKind | null {
  if (layer.type === 'image') return 'image';
  if (layer.type === 'video') return 'video';
  return null;
}

/**
 * Owns every open MediaSource and serves frames to the renderer.
 *
 *   Asset/Layer -> MediaController -> MediaBackend -> MediaSource
 *                         |-> per-source MediaFrameScheduler -> MediaFrameCache
 */
export class MediaController implements FrameProvider {
  private readonly backend: MediaBackend;
  private readonly maxFrames: number;
  private readonly maxBytes: number;
  private readonly lookahead: number;
  private readonly entries = new Map<string, MediaEntry>();
  private readonly listeners = new Set<() => void>();
  private playing = false;
  private disposed = false;

  constructor(options: MediaControllerOptions = {}) {
    this.backend = options.backend ?? createMediaBackend();
    this.maxFrames = options.maxCachedFramesPerSource ?? DEFAULT_MAX_FRAMES_PER_SOURCE;
    this.maxBytes = options.maxCacheBytes ?? DEFAULT_FRAME_BUDGET_BYTES;
    this.lookahead = Math.max(0, options.lookaheadSeconds ?? DEFAULT_LOOKAHEAD_SECONDS);
  }

  // --- Transport -----------------------------------------------------------

  /**
   * Playback started or stopped. While playing, the frames after the playhead are decoded
   * ahead of time (bounded by the frame budget); pausing cancels that work so the decoder
   * is free for scrubbing.
   */
  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    if (!playing) for (const entry of this.entries.values()) this.cancelAhead(entry);
  }

  getStats(): MediaCacheStats {
    let sources = 0;
    let frames = 0;
    let bytes = 0;
    for (const entry of this.entries.values()) {
      if (entry.kind !== 'video' || !entry.source) continue;
      sources += 1;
      frames += entry.scheduler.cache.size;
      bytes += entry.scheduler.cache.bytes;
    }
    return { sources, frames, bytes, budgetBytes: this.maxBytes };
  }

  // --- FrameProvider -------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getDimensions(layer: Layer): { width: number; height: number } | null {
    const url = layer.content.mediaUrl;
    if (!url) return null;
    const meta = this.entries.get(url)?.metadata;
    return meta?.width && meta.height ? { width: meta.width, height: meta.height } : null;
  }

  resolve(layer: Layer, compTime: number): ResolvedFrame {
    const url = layer.content.mediaUrl;
    const kind = kindForLayer(layer);
    if (!kind) return { frame: null, status: 'none' };
    // An asset-backed layer without a URL is offline (e.g. project reopened, file not relinked yet).
    if (!url) return { frame: null, status: layer.content.assetId ? 'error' : 'none' };

    const entry = this.ensureEntry(url, kind);
    if (entry.status !== 'ready' || !entry.source) return { frame: null, status: entry.status };
    if (kind === 'image') return { frame: entry.still, status: entry.still ? 'ready' : 'loading' };

    const mediaTime = computeMediaTime(layer, compTime, entry.metadata?.duration);
    const cache = entry.scheduler.cache;
    this.trackPlayhead(entry, mediaTime);

    // 1. The frame that is on screen at this time is already decoded.
    const covering = cache.getCovering(mediaTime, DISPLAY_TOLERANCE);
    if (covering) {
      this.decodeAhead(entry);
      return { frame: covering, status: 'ready' };
    }

    // 2. We already decoded for this exact time and this is the best the source has
    //    (e.g. holding the last frame past the end); decoding again would change nothing.
    const fallback = cache.getAtOrBefore(mediaTime) ?? cache.getNearest(mediaTime, Number.POSITIVE_INFINITY);
    const alreadySettled = entry.settled !== null && Math.abs(entry.settled - mediaTime) < SETTLE_EPSILON;
    if (!alreadySettled) this.want(entry, mediaTime);

    // While a decode is pending, show the closest thing we have rather than a hole.
    return { frame: fallback ?? null, status: fallback ? 'ready' : 'loading' };
  }

  // --- Asset import / export helpers ---------------------------------------

  /** Open a URL (reusing an existing source) and return its metadata. */
  async probe(url: string, kind?: MediaKind): Promise<MediaMetadata> {
    const resolvedKind = kind ?? inferMediaKind(url);
    const entry = this.ensureEntry(url, resolvedKind);
    await entry.ready;
    if (entry.status === 'error' || !entry.metadata) throw new Error(entry.error ?? 'Unable to open media');
    return entry.metadata;
  }

  /** Decode (and await) the frames every visible media layer needs at `time`. */
  async prefetch(composition: Composition, time: number): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const layer of composition.layers) {
      if (!layer.visible) continue;
      if (time < layer.start || time > layer.start + layer.duration) continue;
      const kind = kindForLayer(layer);
      const url = layer.content.mediaUrl;
      if (!kind || !url) continue;
      const entry = this.ensureEntry(url, kind);
      jobs.push(
        entry.ready.then(() => {
          if (entry.status !== 'ready' || kind === 'image') return;
          const mediaTime = computeMediaTime(layer, time, entry.metadata?.duration);
          return this.decode(entry, mediaTime).catch(() => null);
        })
      );
    }
    await Promise.all(jobs);
  }

  /** Release one URL (e.g. when its asset is deleted). */
  release(url: string): void {
    const entry = this.entries.get(url);
    if (!entry) return;
    this.entries.delete(url);
    this.teardown(entry);
  }

  /** Drop everything (project switch). */
  reset(): void {
    for (const entry of this.entries.values()) this.teardown(entry);
    this.entries.clear();
    this.notify();
  }

  dispose(): void {
    this.disposed = true;
    this.reset();
    this.listeners.clear();
  }

  // --- internals -----------------------------------------------------------

  private ensureEntry(url: string, kind: MediaKind): MediaEntry {
    const existing = this.entries.get(url);
    if (existing) return existing;

    const entry: MediaEntry = {
      url,
      kind,
      status: 'loading',
      source: null,
      metadata: null,
      scheduler: new MediaFrameScheduler({
        cache: new MediaFrameCache({ maxFrames: this.maxFrames, maxBytes: this.maxBytes }),
      }),
      ready: Promise.resolve(),
      still: null,
      chain: Promise.resolve(),
      inFlight: false,
      wanted: null,
      settled: null,
      playhead: null,
      aheadUntil: Number.NEGATIVE_INFINITY,
      aheadRunning: false,
      aheadEpoch: 0,
    };
    this.entries.set(url, entry);

    entry.ready = (async () => {
      try {
        const source = await this.backend.open(url, kind);
        if (this.disposed || this.entries.get(url) !== entry) {
          source.dispose();
          return;
        }
        entry.source = source;
        entry.metadata = source.metadata ?? (await source.load());
        if (kind === 'image') entry.still = await source.getFrame(0);
        entry.status = 'ready';
        this.rebalance();
      } catch (error) {
        entry.status = 'error';
        entry.error = error instanceof Error ? error.message : String(error);
      }
      this.notify();
    })();

    return entry;
  }

  private decode(entry: MediaEntry, mediaTime: number): Promise<MediaFrame | null> {
    const run = entry.chain.then(() =>
      entry.source ? entry.scheduler.getFrame(entry.source, mediaTime) : null
    );
    entry.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /** Latest-wins: while one decode runs, only the newest wanted time is kept. */
  private want(entry: MediaEntry, mediaTime: number): void {
    entry.wanted = mediaTime;
    if (!entry.inFlight) void this.pump(entry);
  }

  private async pump(entry: MediaEntry): Promise<void> {
    entry.inFlight = true;
    try {
      while (entry.wanted !== null && !this.disposed) {
        const target = entry.wanted;
        entry.wanted = null;
        try {
          await this.decode(entry, target);
        } catch {
          // A failed decode is also "settled": retrying the same time every render would spin.
        }
        if (this.disposed) return;
        entry.settled = target;
        this.notify();
        // A request that arrived mid-decode is already answered if it falls in the same frame.
        if (entry.wanted !== null && entry.scheduler.cache.getCovering(entry.wanted, DISPLAY_TOLERANCE)) {
          entry.wanted = null;
        }
      }
    } finally {
      entry.inFlight = false;
    }
  }

  private teardown(entry: MediaEntry): void {
    entry.wanted = null;
    this.cancelAhead(entry);
    entry.scheduler.clear();
    entry.still?.close();
    entry.source?.dispose();
  }

  // --- Memory budget -------------------------------------------------------

  /**
   * One byte budget is shared by every open video source. Splitting it evenly keeps the total
   * bounded no matter how many clips are on the timeline; each cache evicts down to its share.
   */
  private rebalance(): void {
    const video = [...this.entries.values()].filter((e) => e.kind === 'video' && e.source);
    if (video.length === 0) return;
    const share = Math.max(1, Math.floor(this.maxBytes / video.length));
    for (const entry of video) entry.scheduler.cache.setLimits({ maxBytes: share });
  }

  // --- Decode-ahead --------------------------------------------------------

  /** Remember where the playhead is, and drop decode-ahead progress when it jumped. */
  private trackPlayhead(entry: MediaEntry, mediaTime: number): void {
    const previous = entry.playhead;
    if (previous !== null && (mediaTime < previous - TIME_EPSILON || mediaTime > previous + DISCONTINUITY_JUMP)) {
      // Seek, scrub or loop wrap: what was decoded ahead no longer lines up with the playhead.
      this.cancelAhead(entry);
    }
    entry.playhead = mediaTime;
  }

  private cancelAhead(entry: MediaEntry): void {
    entry.aheadEpoch += 1;
    entry.aheadUntil = Number.NEGATIVE_INFINITY;
  }

  private decodeAhead(entry: MediaEntry): void {
    if (!this.playing || this.lookahead <= 0 || entry.aheadRunning || !entry.source?.supportsPrefetch) return;
    if (entry.playhead === null) return;
    if (entry.aheadUntil >= entry.playhead + this.lookahead - TIME_EPSILON) return; // far enough ahead
    void this.runAhead(entry);
  }

  /**
   * Decode the frames after the playhead one at a time, through the same per-source chain as
   * on-screen decodes, so an urgent request waits for at most one frame. It stops when the
   * lookahead is reached, the budget is full (a longer lookahead must never evict the frames
   * about to be shown), the media ends, or playback pauses or jumps.
   */
  private async runAhead(entry: MediaEntry): Promise<void> {
    entry.aheadRunning = true;
    const epoch = entry.aheadEpoch;
    const frameBytes = Math.max(1, (entry.metadata?.width ?? 0) * (entry.metadata?.height ?? 0) * 4);
    const duration = entry.metadata?.duration;
    try {
      while (!this.disposed && this.playing && epoch === entry.aheadEpoch && entry.playhead !== null) {
        if (entry.inFlight) return; // the frame on screen is being decoded: that goes first
        const horizon = entry.playhead + this.lookahead;
        if (entry.aheadUntil >= horizon - TIME_EPSILON) return;
        // Frames the playhead has already passed make room for the ones about to be shown.
        entry.scheduler.cache.evictBefore(entry.playhead);
        if (!entry.scheduler.cache.canFit(frameBytes)) return; // budget reached: lookahead is memory-limited

        const from = Math.max(entry.aheadUntil, entry.playhead);
        // Nothing to decode past the last frame (the renderer holds it).
        if (duration !== undefined && from >= duration - 1 / 120) {
          entry.aheadUntil = Number.POSITIVE_INFINITY;
          return;
        }
        const frame = await this.decode(entry, from);
        if (epoch !== entry.aheadEpoch) return;
        if (!frame) {
          entry.aheadUntil = Number.POSITIVE_INFINITY; // nothing more to decode (end of media)
          return;
        }
        const end = frame.timestamp + (frame.duration && frame.duration > 0 ? frame.duration : FALLBACK_FRAME_DURATION);
        if (end <= from + 1e-6) {
          entry.aheadUntil = Number.POSITIVE_INFINITY; // no progress: held last frame
          return;
        }
        entry.aheadUntil = end;
      }
    } catch {
      // A failed decode-ahead is harmless: the frame is decoded on demand when it is needed.
      if (epoch === entry.aheadEpoch) entry.aheadUntil = Number.POSITIVE_INFINITY;
    } finally {
      entry.aheadRunning = false;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
