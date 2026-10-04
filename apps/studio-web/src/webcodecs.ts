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
  private queue: DecodedVideoFrame[] = [];
  private failure: Error | null = null;

  configure(config: VideoDecoderConfigLike): void {
    if (!supportsWebCodecs()) throw new Error('WebCodecs VideoDecoder is unavailable.');
    this.close();

    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.queue.push({
          frame,
          timestamp: frame.timestamp ?? 0,
          close: () => frame.close(),
        });
      },
      error: (error) => {
        this.failure = error;
      },
    });

    this.decoder.configure(config as VideoDecoderConfig);
  }

  decode(chunk: EncodedVideoChunk): void {
    if (!this.decoder) throw new Error('WebCodecs decoder has not been configured.');
    if (this.failure) throw this.failure;
    this.decoder.decode(chunk);
  }

  takeFrame(): DecodedVideoFrame | null {
    return this.queue.shift() ?? null;
  }

  async flush(): Promise<void> {
    if (!this.decoder) return;
    await this.decoder.flush();
    if (this.failure) throw this.failure;
  }

  reset(): void {
    this.decoder?.reset();
    this.failure = null;
    this.clearFrames();
  }

  close(): void {
    this.decoder?.close();
    this.decoder = null;
    this.failure = null;
    this.clearFrames();
  }

  private clearFrames(): void {
    for (const item of this.queue) item.close();
    this.queue.length = 0;
  }
}
