import type { AudioBackend, AudioChunk, AudioClipSource } from '../demux/audio-source';
import { layerGain, type Composition, type Layer } from '../model';
import { isAudible } from './audio-controller';

/** One mixed stretch of the composition's audio: planar float PCM, one array per channel. */
export interface MixedBlock {
  /** Composition time of the first sample, seconds. */
  timestamp: number;
  sampleRate: number;
  channels: Float32Array[];
}

export interface MixerOptions {
  backend: AudioBackend;
  sampleRate?: number;
  channels?: number;
  /** Length of one mixed block, seconds. Bounds memory: only one block plus the decoded chunks around it are held. */
  blockSeconds?: number;
  signal?: AbortSignal;
}

interface MixLayer {
  layer: Layer;
  source: AudioClipSource;
  gain: number;
  iterator: AsyncGenerator<AudioChunk, void, unknown>;
  pending: AudioChunk[];
  done: boolean;
}

const chunkStart = (layer: Layer, chunk: AudioChunk) => layer.start + chunk.timestamp - (layer.content.mediaInPoint ?? 0);

/**
 * Offline mix-down of the composition's audio, for export. Every audible layer (audio layers
 * and the audio of video layers) is decoded sequentially and summed at the layer's position on
 * the timeline, honoring start, duration and media in-point, then resampled to the export
 * rate with linear interpolation and clamped to [-1, 1]. Sources are opened once up front so
 * the exporter knows whether there is any audio before it starts the output file.
 */
export class CompositionAudioMixer {
  readonly sampleRate: number;
  readonly channelCount: number;
  private readonly blockFrames: number;
  private readonly totalFrames: number;
  private cursor = 0;

  private constructor(
    private readonly comp: Composition,
    private readonly layers: MixLayer[],
    private readonly signal: AbortSignal | undefined,
    sampleRate: number,
    channels: number,
    blockSeconds: number
  ) {
    this.sampleRate = sampleRate;
    this.channelCount = channels;
    this.blockFrames = Math.max(1, Math.round(blockSeconds * sampleRate));
    this.totalFrames = Math.max(0, Math.round(comp.duration * sampleRate));
  }

  static async open(comp: Composition, options: MixerOptions): Promise<CompositionAudioMixer> {
    const sampleRate = options.sampleRate ?? 48000;
    const channels = options.channels ?? 2;
    const urls = new Map<string, Promise<AudioClipSource | null>>();
    const layers: MixLayer[] = [];
    const owned: AudioClipSource[] = [];

    for (const layer of comp.layers) {
      const gain = layerGain(layer);
      if (!isAudible(layer) || gain <= 0) continue; // muted layers are not even decoded
      const url = layer.content.mediaUrl as string;
      let opening = urls.get(url);
      if (!opening) {
        opening = options.backend.open(url).catch(() => null); // a file that cannot be decoded is silent, not fatal
        urls.set(url, opening);
      }
      const source = await opening;
      if (!source) continue;
      if (!owned.includes(source)) owned.push(source);
      layers.push({ layer, source, gain, iterator: source.chunks(layer.content.mediaInPoint ?? 0), pending: [], done: false });
    }
    return new CompositionAudioMixer(comp, layers, options.signal, sampleRate, channels, options.blockSeconds ?? 1);
  }

  /** True when at least one layer has decodable audio. */
  get hasAudio(): boolean {
    return this.layers.length > 0 && this.totalFrames > 0;
  }

  /** Composition time up to which audio has been mixed. */
  get mixedUntil(): number {
    return Math.min(this.cursor, this.totalFrames) / this.sampleRate;
  }

  get finished(): boolean {
    return this.cursor >= this.totalFrames;
  }

  /** Mix and return the next block, or null at the end of the composition. */
  async nextBlock(): Promise<MixedBlock | null> {
    if (this.finished) return null;
    if (this.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');

    const first = this.cursor;
    const frames = Math.min(this.blockFrames, this.totalFrames - first);
    const tStart = first / this.sampleRate;
    const tEnd = (first + frames) / this.sampleRate;
    const out = Array.from({ length: this.channelCount }, () => new Float32Array(frames));

    for (const entry of this.layers) {
      const layerStart = entry.layer.start;
      const layerEnd = layerStart + entry.layer.duration;
      if (layerEnd <= tStart || layerStart >= tEnd) continue;
      await this.fill(entry, Math.min(tEnd, layerEnd));
      for (const chunk of entry.pending) this.mixChunk(out, first, frames, entry.layer, entry.gain, chunk);
      entry.pending = entry.pending.filter((chunk) => chunkStart(entry.layer, chunk) + chunk.duration > tEnd);
    }

    for (const channel of out) {
      for (let i = 0; i < channel.length; i += 1) {
        const v = channel[i];
        if (v > 1) channel[i] = 1;
        else if (v < -1) channel[i] = -1;
      }
    }
    this.cursor += frames;
    return { timestamp: tStart, sampleRate: this.sampleRate, channels: out };
  }

  async dispose(): Promise<void> {
    const seen = new Set<AudioClipSource>();
    for (const entry of this.layers) {
      await entry.iterator.return(undefined).catch(() => undefined);
      entry.pending = [];
      if (!seen.has(entry.source)) {
        seen.add(entry.source);
        entry.source.dispose();
      }
    }
    this.layers.length = 0;
  }

  // ---------------------------------------------------------------------------

  /** Decode until the layer's chunks cover composition time `until`. */
  private async fill(entry: MixLayer, until: number): Promise<void> {
    while (!entry.done) {
      const last = entry.pending[entry.pending.length - 1];
      if (last && chunkStart(entry.layer, last) + last.duration >= until) return;
      let next: IteratorResult<AudioChunk, void>;
      try {
        next = await entry.iterator.next();
      } catch {
        entry.done = true; // decode error: the rest of this layer is silent
        return;
      }
      if (next.done) {
        entry.done = true;
        return;
      }
      entry.pending.push(next.value);
    }
  }

  private mixChunk(out: Float32Array[], first: number, frames: number, layer: Layer, gain: number, chunk: AudioChunk): void {
    const rate = this.sampleRate;
    const buffer = chunk.buffer;
    const srcRate = buffer.sampleRate;
    const srcLength = buffer.length;
    const srcChannels = Math.max(1, buffer.numberOfChannels);
    if (srcLength === 0) return;

    const cs = chunkStart(layer, chunk);
    const lo = Math.max(first, Math.ceil(Math.max(cs, layer.start) * rate - 1e-9));
    const hi = Math.min(first + frames, Math.ceil(Math.min(cs + chunk.duration, layer.start + layer.duration) * rate - 1e-9));
    if (hi <= lo) return;

    const planes: Float32Array[] = [];
    for (let c = 0; c < srcChannels; c += 1) planes.push(buffer.getChannelData(c));

    for (let k = lo; k < hi; k += 1) {
      const pos = (k / rate - cs) * srcRate;
      const i0 = Math.min(srcLength - 1, Math.max(0, Math.floor(pos)));
      const i1 = Math.min(srcLength - 1, i0 + 1);
      const frac = Math.min(1, Math.max(0, pos - i0));
      for (let c = 0; c < out.length; c += 1) {
        const plane = planes[Math.min(c, srcChannels - 1)]; // mono feeds every output channel
        out[c][k - first] += (plane[i0] + (plane[i1] - plane[i0]) * frac) * gain;
      }
    }
  }
}
