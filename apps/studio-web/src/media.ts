export type MediaKind = 'video' | 'audio' | 'image';

export interface MediaMetadata {
  kind: MediaKind;
  duration?: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
}

export interface MediaFrame {
  timestamp: number;
  duration?: number;
  width: number;
  height: number;
  source: CanvasImageSource | VideoFrame;
  close(): void;
}

export interface MediaSource {
  readonly id: string;
  readonly url: string;
  readonly metadata: MediaMetadata | null;
  load(signal?: AbortSignal): Promise<MediaMetadata>;
  seek(time: number): Promise<void>;
  getFrame(time: number, signal?: AbortSignal): Promise<MediaFrame | null>;
  dispose(): void;
}

export interface MediaBackend {
  readonly name: string;
  readonly supportsHardwareDecode: boolean;
  open(url: string, kind?: MediaKind): Promise<MediaSource>;
}

function abortError(): DOMException {
  return new DOMException('The media operation was aborted.', 'AbortError');
}

function waitForEvent(target: EventTarget, event: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const cleanup = () => {
      target.removeEventListener(event, onEvent);
      signal?.removeEventListener('abort', onAbort);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    target.addEventListener(event, onEvent, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

class BrowserMediaSource implements MediaSource {
  readonly id = crypto.randomUUID();
  private readonly element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  private loadedMetadata: MediaMetadata | null = null;
  private disposed = false;

  constructor(readonly url: string, private readonly kind: MediaKind) {
    if (kind === 'video') {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      this.element = video;
    } else if (kind === 'audio') {
      const audio = document.createElement('audio');
      audio.preload = 'auto';
      this.element = audio;
    } else {
      const image = new Image();
      image.decoding = 'async';
      this.element = image;
    }

    this.element.src = url;
  }

  get metadata(): MediaMetadata | null {
    return this.loadedMetadata;
  }

  async load(signal?: AbortSignal): Promise<MediaMetadata> {
    if (this.disposed) throw new Error('Media source has been disposed.');
    if (this.loadedMetadata) return this.loadedMetadata;

    if (this.kind === 'image') {
      const image = this.element as HTMLImageElement;
      if (!image.complete) await waitForEvent(image, 'load', signal);
      if (!image.naturalWidth) throw new Error(`Unable to decode image: ${this.url}`);
      this.loadedMetadata = {
        kind: 'image',
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      return this.loadedMetadata;
    }

    const media = this.element as HTMLMediaElement;
    if (media.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForEvent(media, 'loadedmetadata', signal);
    }

    this.loadedMetadata = {
      kind: this.kind,
      duration: Number.isFinite(media.duration) ? media.duration : undefined,
      width: this.kind === 'video' ? (media as HTMLVideoElement).videoWidth : undefined,
      height: this.kind === 'video' ? (media as HTMLVideoElement).videoHeight : undefined,
    };
    return this.loadedMetadata;
  }

  async seek(time: number): Promise<void> {
    await this.load();
    if (this.kind === 'image') return;

    const media = this.element as HTMLMediaElement;
    if (Math.abs(media.currentTime - time) < 0.0005) return;

    media.currentTime = Math.max(0, time);
    await waitForEvent(media, 'seeked');
  }

  async getFrame(time: number, signal?: AbortSignal): Promise<MediaFrame | null> {
    const metadata = await this.load(signal);
    if (metadata.kind === 'image') {
      const image = this.element as HTMLImageElement;
      return {
        timestamp: 0,
        width: image.naturalWidth,
        height: image.naturalHeight,
        source: image,
        close() {},
      };
    }

    await this.seek(time);
    if (this.kind !== 'video') return null;

    const video = this.element as HTMLVideoElement;
    const timestamp = video.currentTime;

    if (typeof VideoFrame !== 'undefined') {
      const frame = new VideoFrame(video, { timestamp: Math.round(timestamp * 1_000_000) });
      return {
        timestamp,
        width: video.videoWidth,
        height: video.videoHeight,
        source: frame,
        close: () => frame.close(),
      };
    }

    return {
      timestamp,
      width: video.videoWidth,
      height: video.videoHeight,
      source: video,
      close() {},
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if ('pause' in this.element && typeof this.element.pause === 'function') this.element.pause();
    this.element.removeAttribute('src');
    if ('load' in this.element && typeof this.element.load === 'function') this.element.load();
  }
}

export class BrowserMediaBackend implements MediaBackend {
  readonly name = 'browser-media';
  readonly supportsHardwareDecode = typeof VideoDecoder !== 'undefined';

  async open(url: string, kind?: MediaKind): Promise<MediaSource> {
    const resolvedKind = kind ?? inferMediaKind(url);
    const source = new BrowserMediaSource(url, resolvedKind);
    await source.load();
    return source;
  }
}

export function inferMediaKind(url: string): MediaKind {
  const pathname = url.split(/[?#]/, 1)[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif|svg)$/.test(pathname)) return 'image';
  if (/\.(mp3|wav|ogg|aac|m4a|flac)$/.test(pathname)) return 'audio';
  return 'video';
}
