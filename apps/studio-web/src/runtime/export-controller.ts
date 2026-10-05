import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
} from 'mediabunny';
import { getActiveComposition } from '../editor';
import { CompositionRenderer } from '../renderer';
import { deserializeProject, serializeProject } from '../model';
import type { EditorRuntime } from './editor-runtime';

export interface WebMExportOptions {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
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
  constructor(private readonly runtime: EditorRuntime) {}

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
   */
  async exportWebM({ onProgress, signal }: WebMExportOptions = {}): Promise<void> {
    const comp = getActiveComposition(this.runtime.getState());
    const width = comp.width - (comp.width % 2);
    const height = comp.height - (comp.height % 2);
    const fps = Math.max(1, comp.fps);

    const codec = await getFirstEncodableVideoCodec(['vp9', 'vp8'], { width, height });
    if (!codec) throw new Error('This browser has no WebCodecs video encoder for WebM (VP9/VP8).');

    this.runtime.playback.pause();

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const renderer = new CompositionRenderer(canvas, this.runtime.media);

    const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
    const videoSource = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH });
    output.addVideoTrack(videoSource, { frameRate: fps });
    await output.start();

    try {
      const totalFrames = Math.max(1, Math.round(comp.duration * fps));
      for (let f = 0; f < totalFrames; f += 1) {
        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
        const t = f / fps;
        await this.runtime.media.prefetch(comp, t);
        renderer.render(comp, t, 1, [0, 0], { exportMode: true });
        await videoSource.add(t, 1 / fps);
        if (f % 4 === 0) {
          onProgress?.(Math.round((f / totalFrames) * 100));
          await yieldToUI();
        }
      }
      await output.finalize();
    } catch (error) {
      await output.cancel().catch(() => undefined);
      throw error;
    }

    onProgress?.(100);
    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error('Encoder produced no output.');
    download(new Blob([buffer], { type: 'video/webm' }), `${slug(comp.name)}.webm`);
  }
}
