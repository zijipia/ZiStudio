import type { DemuxedPacket, Demuxer, VideoTrackInfo } from './demux/demuxer';
import { MediabunnyDemuxer } from './demux/mediabunny-demuxer';
import {
  BrowserMediaBackend,
  type MediaBackend,
  type MediaFrame,
  type MediaKind,
  type MediaMetadata,
  type MediaSource,
} from './media';
import { TIME_EPSILON } from './media-cache';
import { supportsWebCodecs, WebCodecsVideoDecoder } from './webcodecs';

/** A decoded picture owned by the source until it is trimmed away or the source is disposed. */
export interface Picture {
  /** Container timeline, seconds. */
  readonly timestamp: number;
  readonly duration: number;
  readonly width: number;
  readonly height: number;
  /** Hand out an independently closable MediaFrame (the picture itself stays owned here). */
  toMediaFrame(origin: number): MediaFrame;
  close(): void;
}

/** What the source needs from a decoder; the WebCodecs-backed one is the default. */
export interface PictureDecoder {
  configure(info: VideoTrackInfo): void;
  decode(packet: DemuxedPacket): void;
  /** Pictures decoded so far, in presentation order. */
  takePictures(): Picture[];
  /** Resolve when the decoder has caught up enough to accept more input. */
  idle(): Promise<void>;
  flush(): Promise<void>;
  /** Forget everything; the next packet must be a key packet. */
  reset(): void;
  close(): void;
}

const MAX_QUEUED_PACKETS = 4;

function abortError(): DOMException {
  return new DOMException('The media operation was aborted.', 'AbortError');
}

export class WebCodecsPictureDecoder implements PictureDecoder {
  private readonly decoder = new WebCodecsVideoDecoder();

  configure(info: VideoTrackInfo): void {
    this.decoder.configure({
      codec: info.codec,
      codedWidth: info.codedWidth,
      codedHeight: info.codedHeight,
      description: info.description as BufferSource | undefined,
    });
  }

  decode(packet: DemuxedPacket): void {
    this.decoder.decode(
      new EncodedVideoChunk({
        type: packet.isKey ? 'key' : 'delta',
        timestamp: Math.round(packet.timestamp * 1e6),
        duration: Math.round(packet.duration * 1e6),
        data: packet.data,
      })
    );
  }

  takePictures(): Picture[] {
    return this.decoder.takeAllFrames().map((decoded) => {
      const frame = decoded.frame;
      return {
        timestamp: decoded.timestamp / 1e6,
        duration: (frame.duration ?? 0) / 1e6,
        width: frame.displayWidth,
        height: frame.displayHeight,
        toMediaFrame: (origin) => {
          // clone() is a cheap reference to the same pixels, so the cache can close its
          // copy without invalidating the picture this source still needs to continue decoding.
          const copy = frame.clone();
          return {
            timestamp: decoded.timestamp / 1e6 - origin,
            duration: (frame.duration ?? 0) / 1e6,
            width: frame.displayWidth,
            height: frame.displayHeight,
            source: copy,
            close: () => copy.close(),
          };
        },
        close: () => decoded.close(),
      };
    });
  }

  async idle(): Promise<void> {
    while (this.decoder.decodeQueueSize > MAX_QUEUED_PACKETS) await this.decoder.waitForProgress();
  }

  flush(): Promise<void> {
    return this.decoder.flush();
  }

  reset(): void {
    this.decoder.reset();
  }

  close(): void {
    this.decoder.close();
  }
}

export class WebCodecsMediaSource implements MediaSource {
  readonly id = crypto.randomUUID();
  readonly supportsPrefetch = true;
  private loaded: MediaMetadata | null = null;
  private info: VideoTrackInfo | null = null;

  /**
   * `ahead[0]` is the picture currently on screen (the last one with timestamp <= the last
   * requested time); anything after it was decoded early and is waiting for its turn.
   */
  private ahead: Picture[] = [];
  /** Last packet handed to the decoder; null right after a reset. */
  private lastFed: DemuxedPacket | null = null;
  /** True once the whole stream was fed and flushed (the decoder then needs a key packet again). */
  private ended = false;
  private chain: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(
    readonly url: string,
    private readonly demuxer: Demuxer,
    private readonly decoder: PictureDecoder,
    info: VideoTrackInfo
  ) {
    this.info = info;
    this.decoder.configure(info);
    this.loaded = {
      kind: 'video',
      duration: info.duration,
      width: info.codedWidth,
      height: info.codedHeight,
      videoCodec: info.codec,
    };
  }

  get metadata(): MediaMetadata | null {
    return this.loaded;
  }

  async load(): Promise<MediaMetadata> {
    return this.loaded as MediaMetadata;
  }

  async seek(): Promise<void> {
    // Seeking is implicit in getFrame(); kept for the MediaSource contract.
  }

  getFrame(time: number, signal?: AbortSignal): Promise<MediaFrame | null> {
    // One decode at a time: the decoder and the `ahead` window are shared state.
    const run = this.chain.then(() => this.decodeAt(time, signal));
    this.chain = run.catch(() => undefined);
    return run;
  }

  dispose(): void {
    this.disposed = true;
    for (const picture of this.ahead) picture.close();
    this.ahead = [];
    this.decoder.close();
    this.demuxer.dispose();
  }

  // ---------------------------------------------------------------------------

  private async decodeAt(mediaTime: number, signal?: AbortSignal): Promise<MediaFrame | null> {
    if (this.disposed || !this.info) return null;
    if (signal?.aborted) throw abortError();

    const origin = this.info.origin;
    // The epsilon absorbs container timestamp quantization, so a request that lands exactly
    // on a frame boundary gets that frame and not the one before it.
    const t = Math.max(0, mediaTime) + origin + TIME_EPSILON;

    this.collect(t);
    if (this.answer(t, false)) return this.currentFrame(origin);

    const key = await this.demuxer.keyPacketAtOrBefore(t);
    if (!key) return null;

    // Keep decoding forward when the wanted time is in the stretch we are already decoding
    // (normal playback): no reset, no re-decode from the key frame.
    const current = this.ahead[0];
    const canContinue =
      !this.ended &&
      this.lastFed !== null &&
      current !== undefined &&
      current.timestamp <= t &&
      key.timestamp <= this.lastFed.timestamp;

    let next: DemuxedPacket | null = null;
    if (!canContinue) {
      this.restart();
      next = key;
    }
    // Only right after a restart is "t precedes every decoded frame" a real answer;
    // otherwise the window just holds frames from the future and an earlier one is needed.
    const restarted = !canContinue;

    for (;;) {
      if (signal?.aborted) throw abortError();
      if (this.disposed) return null;

      this.collect(t);
      if (this.answer(t, restarted)) break;

      const packet: DemuxedPacket | null =
        next ?? (this.lastFed ? await this.demuxer.nextPacket(this.lastFed) : null);
      next = null;

      if (!packet) {
        // End of stream: flush so reordered frames still held by the decoder come out.
        await this.decoder.flush();
        this.ended = true;
        this.collect(t);
        break;
      }

      this.decoder.decode(packet);
      this.lastFed = packet;
      await this.decoder.idle();
    }

    return this.ahead.length > 0 ? this.currentFrame(origin) : null;
  }

  /** MediaFrame for `ahead[0]`; when the container gave no duration, use the gap to the next frame. */
  private currentFrame(origin: number): MediaFrame {
    const [first, second] = this.ahead;
    const frame = first.toMediaFrame(origin);
    if (!frame.duration && second) frame.duration = second.timestamp - first.timestamp;
    return frame;
  }

  /** Move newly decoded pictures into the window and drop the ones that are already in the past. */
  private collect(t: number): void {
    const fresh = this.decoder.takePictures();
    if (fresh.length > 0) {
      this.ahead.push(...fresh);
      this.ahead.sort((a, b) => a.timestamp - b.timestamp);
    }
    while (this.ahead.length >= 2 && this.ahead[1].timestamp <= t) {
      this.ahead.shift()!.close();
    }
  }

  /** True when `ahead[0]` is the frame to show at `t`. */
  private answer(t: number, restarted: boolean): boolean {
    const [first, second] = this.ahead;
    if (!first) return false;
    if (first.timestamp > t) return restarted; // t precedes every frame decoded since the restart
    if (second) return second.timestamp > t;
    return this.ended; // last frame of the stream is held
  }

  private restart(): void {
    for (const picture of this.ahead) picture.close();
    this.ahead = [];
    this.decoder.reset();
    this.lastFed = null;
    this.ended = false;
  }
}

export interface WebCodecsBackendOptions {
  fallback?: MediaBackend;
  createDemuxer?: (url: string) => Demuxer;
  createDecoder?: () => PictureDecoder;
  /** Defaults to VideoDecoder.isConfigSupported. */
  isConfigSupported?: (info: VideoTrackInfo) => Promise<boolean>;
  available?: () => boolean;
}

async function defaultIsConfigSupported(info: VideoTrackInfo): Promise<boolean> {
  try {
    const result = await VideoDecoder.isConfigSupported({
      codec: info.codec,
      codedWidth: info.codedWidth,
      codedHeight: info.codedHeight,
      description: info.description as BufferSource | undefined,
    });
    return result.supported === true;
  } catch {
    return false;
  }
}

/**
 * Video goes through demux -> WebCodecs for frame-accurate access. Anything the pipeline
 * cannot handle (images, audio, rotated video, codecs the browser cannot decode, containers
 * it cannot parse) transparently falls back to the browser media backend.
 */
export class WebCodecsMediaBackend implements MediaBackend {
  readonly name = 'webcodecs';
  readonly supportsHardwareDecode = true;

  private readonly fallback: MediaBackend;
  private readonly createDemuxer: (url: string) => Demuxer;
  private readonly createDecoder: () => PictureDecoder;
  private readonly isConfigSupported: (info: VideoTrackInfo) => Promise<boolean>;
  private readonly available: () => boolean;

  constructor(options: WebCodecsBackendOptions = {}) {
    this.fallback = options.fallback ?? new BrowserMediaBackend();
    this.createDemuxer = options.createDemuxer ?? ((url) => new MediabunnyDemuxer(url));
    this.createDecoder = options.createDecoder ?? (() => new WebCodecsPictureDecoder());
    this.isConfigSupported = options.isConfigSupported ?? defaultIsConfigSupported;
    this.available = options.available ?? supportsWebCodecs;
  }

  async open(url: string, kind?: MediaKind): Promise<MediaSource> {
    if (kind !== 'video' || !this.available()) return this.fallback.open(url, kind);

    const demuxer = this.createDemuxer(url);
    try {
      const info = await demuxer.open();
      if (info && info.rotation === 0 && (await this.isConfigSupported(info))) {
        return new WebCodecsMediaSource(url, demuxer, this.createDecoder(), info);
      }
    } catch (error) {
      console.warn(`WebCodecs pipeline unavailable for this media, using the browser decoder:`, error);
    }
    demuxer.dispose();
    return this.fallback.open(url, kind);
  }
}

/** The default backend for the editor: WebCodecs for video, browser elements for the rest. */
export function createMediaBackend(): MediaBackend {
  return new WebCodecsMediaBackend();
}
