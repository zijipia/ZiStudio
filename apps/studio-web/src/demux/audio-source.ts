import { ALL_FORMATS, AudioBufferSink, Input, type InputAudioTrack } from 'mediabunny';
import { createSource } from './mediabunny-demuxer';

/** One decoded stretch of audio, on the media timeline (0 = first frame of the clip). */
export interface AudioChunk {
  timestamp: number;
  duration: number;
  buffer: AudioBuffer;
}

/** Decoded audio of one media file. The controller pulls chunks sequentially and never seeks backwards. */
export interface AudioClipSource {
  /** Decoded chunks in order, starting at the chunk that contains `start` (seconds). */
  chunks(start: number): AsyncGenerator<AudioChunk, void, unknown>;
  dispose(): void;
}

export interface AudioBackend {
  /** Resolves null when the file has no audio track or the browser cannot decode it. */
  open(url: string): Promise<AudioClipSource | null>;
}

class MediabunnyAudioSource implements AudioClipSource {
  constructor(
    private readonly input: Input,
    private readonly sink: AudioBufferSink,
    /** Container time of media time 0 — the same origin the video decoder subtracts, so A and V line up. */
    private readonly origin: number
  ) {}

  async *chunks(start: number): AsyncGenerator<AudioChunk, void, unknown> {
    for await (const wrapped of this.sink.buffers(Math.max(0, start) + this.origin)) {
      yield { timestamp: wrapped.timestamp - this.origin, duration: wrapped.duration, buffer: wrapped.buffer };
    }
  }

  dispose(): void {
    this.input.dispose();
  }
}

/** Demux + decode audio with mediabunny (WebCodecs AudioDecoder underneath). */
export class MediabunnyAudioBackend implements AudioBackend {
  async open(url: string): Promise<AudioClipSource | null> {
    if (typeof AudioBuffer === 'undefined') return null;
    const input = new Input({ source: await createSource(url), formats: ALL_FORMATS });
    try {
      const track: InputAudioTrack | null = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) {
        input.dispose();
        return null;
      }
      const video = await input.getPrimaryVideoTrack();
      const origin = video ? await video.getFirstTimestamp() : await track.getFirstTimestamp();
      return new MediabunnyAudioSource(input, new AudioBufferSink(track), origin);
    } catch (error) {
      input.dispose();
      throw error;
    }
  }
}
