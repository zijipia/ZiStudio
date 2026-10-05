import {
  inferMediaKind,
  type MediaBackend,
  type MediaFrame,
  type MediaKind,
  type MediaMetadata,
  type MediaSource,
} from '../media';
import { MediaFrameCache } from '../media-cache';
import { MediaFrameScheduler } from '../media-scheduler';
import type { Composition, Layer } from '../model';
import { createMediaBackend } from '../webcodecs-media';
import type { FrameProvider, MediaStatus, ResolvedFrame } from './frame-provider';
import { computeMediaTime } from './media-time';

/** For frames that do not report a duration: how far from its timestamp a frame is still shown. */
const DISPLAY_TOLERANCE = 1 / 48;
const SETTLE_EPSILON = 1e-4;

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
}

export interface MediaControllerOptions {
  backend?: MediaBackend;
  maxCachedFramesPerSource?: number;
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
  private readonly entries = new Map<string, MediaEntry>();
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(options: MediaControllerOptions = {}) {
    this.backend = options.backend ?? createMediaBackend();
    this.maxFrames = options.maxCachedFramesPerSource ?? 8;
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

    // 1. The frame that is on screen at this time is already decoded.
    const covering = cache.getCovering(mediaTime, DISPLAY_TOLERANCE);
    if (covering) return { frame: covering, status: 'ready' };

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
      scheduler: new MediaFrameScheduler({ cache: new MediaFrameCache({ maxFrames: this.maxFrames }) }),
      ready: Promise.resolve(),
      still: null,
      chain: Promise.resolve(),
      inFlight: false,
      wanted: null,
      settled: null,
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
    entry.scheduler.clear();
    entry.still?.close();
    entry.source?.dispose();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
