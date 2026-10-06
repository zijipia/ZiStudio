import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
} from 'mediabunny';
import { MediabunnyAudioBackend, type AudioBackend } from '../demux/audio-source';
import { CompositionAudioMixer, type MixedBlock } from './audio-mixer';
import { getActiveComposition } from '../editor';
import { CompositionRenderer } from '../renderer';
import { compositionAudio, deserializeProject, serializeProject } from '../model';
import type { EditorRuntime } from './editor-runtime';

export interface WebMExportOptions {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface WebMExportResult {
  /**
   * `included`: the composition's audio was mixed into the file. `none`: nothing in the
   * composition has decodable audio. `unsupported`: there is audio but this browser cannot
   * encode Opus/Vorbis, so the file has video only.
   */
  audio: 'included' | 'none' | 'unsupported';
}

function toAudioSample(block: MixedBlock): AudioSample {
  const frames = block.channels[0]?.length ?? 0;
  const planar = new Float32Array(frames * block.channels.length); // f32-planar: all of channel 0, then channel 1, ...
  block.channels.forEach((channel, index) => planar.set(channel, index * frames));
  return new AudioSample({
    data: planar,
    format: 'f32-planar',
    numberOfChannels: block.channels.length,
    sampleRate: block.sampleRate,
    timestamp: block.timestamp,
  });
}

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const slug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

export class ExportController {
  constructor(
    private readonly runtime: EditorRuntime,
    private readonly audioBackend: AudioBackend = new MediabunnyAudioBackend()
  ) {}

  saveProject(): void {
    const project = this.runtime.getState().project;
    download(new Blob([serializeProject(project)], { type: 'application/json' }), `${slug(project.name)}.zproj`);
  }

  async openProject(file: File): Promise<void> {
    const project = deserializeProject(await file.text());
    this.runtime.loadProject(project);
  }

  exportPNG(canvas: HTMLCanvasElement): void {
    const state = this.runtime.getState();
    const comp = getActiveComposition(state);
    const link = document.createElement('a');
    link.download = `zistudio-${slug(comp.name)}-${state.currentTime.toFixed(2)}s.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  /**
   * Deterministic offline WebM export.
   *
   * Every frame is rendered at the composition's own resolution into a private canvas
   * (never the viewer), after the media layers have finished decoding that exact frame.
   * Frames are encoded with WebCodecs and timestamped by frame index, so the output has
   * the exact composition duration regardless of how fast the machine renders.
   * The editor playhead and viewer are not touched.
   *
   * The audio of every audible layer is mixed offline (see `CompositionAudioMixer`) and encoded
   * as Opus, interleaved with the video frames.
   */
  async exportWebM({ onProgress, signal }: WebMExportOptions = {}): Promise<WebMExportResult> {
    const comp = getActiveComposition(this.runtime.getState());
    const width = comp.width - (comp.width % 2);
    const height = comp.height - (comp.height % 2);
    const fps = Math.max(1, comp.fps);

    const codec = await getFirstEncodableVideoCodec(['vp9', 'vp8'], { width, height });
    if (!codec) throw new Error('This browser has no WebCodecs video encoder for WebM (VP9/VP8).');

    this.runtime.playback.pause();

    const audioFormat = compositionAudio(comp);
    const mixer = await CompositionAudioMixer.open(comp, {
      backend: this.audioBackend,
      sampleRate: audioFormat.sampleRate,
      channels: audioFormat.channels,
      signal,
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const renderer = new CompositionRenderer(canvas, this.runtime.media);

    const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
    const videoSource = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH });
    output.addVideoTrack(videoSource, { frameRate: fps });

    let audioSource: AudioSampleSource | null = null;
    let audio: WebMExportResult['audio'] = 'none';
    if (mixer.hasAudio) {
      const audioCodec = await getFirstEncodableAudioCodec(['opus', 'vorbis'], {
        numberOfChannels: audioFormat.channels,
        sampleRate: audioFormat.sampleRate,
      });
      if (audioCodec) {
        audioSource = new AudioSampleSource({ codec: audioCodec, quality: QUALITY_HIGH });
        output.addAudioTrack(audioSource);
        audio = 'included';
      } else {
        audio = 'unsupported';
      }
    }

    /** Encode mixed audio up to composition time `until`, so audio and video are written in step. */
    const pumpAudio = async (until: number) => {
      if (!audioSource) return;
      while (!mixer.finished && mixer.mixedUntil < until) {
        const block = await mixer.nextBlock();
        if (!block) break;
        const sample = toAudioSample(block);
        try {
          await audioSource.add(sample);
        } finally {
          sample.close();
        }
      }
    };

    try {
      await output.start();
      const totalFrames = Math.max(1, Math.round(comp.duration * fps));
      for (let f = 0; f < totalFrames; f += 1) {
        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
        const t = f / fps;
        await this.runtime.media.prefetch(comp, t);
        renderer.render(comp, t, 1, [0, 0], { exportMode: true });
        await videoSource.add(t, 1 / fps);
        await pumpAudio(t + 1); // keep the audio about a second ahead of the video being written
        if (f % 4 === 0) {
          onProgress?.(Math.round((f / totalFrames) * 100));
          await yieldToUI();
        }
      }
      await pumpAudio(comp.duration);
      await output.finalize();
    } catch (error) {
      await output.cancel().catch(() => undefined);
      throw error;
    } finally {
      await mixer.dispose();
    }

    onProgress?.(100);
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error('Encoder produced no output.');
    download(new Blob([buffer], { type: 'video/webm' }), `${slug(comp.name)}.webm`);
    return { audio };
  }
}
