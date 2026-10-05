export interface VideoDecoderConfigLike {
  codec: string;
  codedWidth: number;
  codedHeight: number;
  description?: BufferSource;
  hardwareAcceleration?: HardwareAcceleration;
}

export interface DecodedVideoFrame {
  readonly frame: VideoFrame;
  readonly timestamp: number;
  close(): void;
}

export type HardwareAcceleration = 'no-preference' | 'prefer-hardware' | 'prefer-software';

export function supportsWebCodecs(): boolean {
  return typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined';
}

export function supportsHardwareVideoDecode(): boolean {
  return supportsWebCodecs() && typeof VideoFrame !== 'undefined';
}

/**
 * Thin decoder boundary for future demuxer integration.
 *
 * Container parsing deliberately lives outside this class. GStreamer/GPAC
 * on native and a browser demuxer/GPAC-WASM on Web can feed encoded chunks
 * through the same higher-level media abstraction without coupling the
 * editor to a particular container format.
 */
export class WebCodecsVideoDecoder {
  private decoder: VideoDecoder | null = null;
  private config: VideoDecoderConfigLike | null = null;
  private queue: DecodedVideoFrame[] = [];
  private failure: Error | null = null;
  private waiters: Array<() => void> = [];

  configure(config: VideoDecoderConfigLike): void {
    if (!supportsWebCodecs()) throw new Error('WebCodecs VideoDecoder is unavailable.');
    this.close();
    this.config = config;
    this.createDecoder();
  }

  private createDecoder(): void {
    const decoder = new VideoDecoder({
      output: (frame) => {
        this.queue.push({
          frame,
          timestamp: frame.timestamp ?? 0,
          close: () => frame.close(),
        });
        this.wake();
      },
      error: (error) => {
        this.failure = error;
        this.wake();
      },
    });
    decoder.addEventListener('dequeue', () => this.wake());
    decoder.configure(this.config as VideoDecoderConfig);
    this.decoder = decoder;
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  get decodeQueueSize(): number {
    return this.decoder?.decodeQueueSize ?? 0;
  }

  decode(chunk: EncodedVideoChunk): void {
    if (!this.decoder) throw new Error('WebCodecs decoder has not been configured.');
    if (this.failure) throw this.failure;
    this.decoder.decode(chunk);
  }

  /** Resolve once the decoder reports progress (a dequeue or an output) or fails. */
  waitForProgress(): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise<void>((resolve, reject) => {
      this.waiters.push(() => (this.failure ? reject(this.failure) : resolve()));
    });
  }

  takeFrame(): DecodedVideoFrame | null {
    return this.queue.shift() ?? null;
  }

  takeAllFrames(): DecodedVideoFrame[] {
    const frames = this.queue;
    this.queue = [];
    return frames;
  }

  async flush(): Promise<void> {
    if (!this.decoder) return;
    await this.decoder.flush();
    if (this.failure) throw this.failure;
  }

  /**
   * Drop all queued work and start over. A WebCodecs decoder that has been reset is
   * unconfigured, so it is configured again here; the next chunk must be a key frame.
   */
  reset(): void {
    this.clearFrames();
    this.failure = null;
    if (!this.decoder || !this.config) return;
    this.decoder.reset();
    this.decoder.configure(this.config as VideoDecoderConfig);
    this.wake();
  }

  close(): void {
    if (this.decoder && this.decoder.state !== 'closed') this.decoder.close();
    this.decoder = null;
    this.config = null;
    this.failure = null;
    this.clearFrames();
    this.wake();
  }

  private clearFrames(): void {
    for (const item of this.queue) item.close();
    this.queue.length = 0;
  }
}
