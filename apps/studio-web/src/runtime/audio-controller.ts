import { audioEngine } from '../audio';
import { MediabunnyAudioBackend, type AudioBackend, type AudioChunk, type AudioClipSource } from '../demux/audio-source';
import { layerGain, type Composition, type Layer } from '../model';

/** The sound device. `audioEngine` is the real one; tests inject a fake with a controllable clock. */
export interface AudioOutput {
  readonly state: 'running' | 'suspended' | 'unavailable';
  /** Output clock in seconds. */
  now(): number;
  /** Seconds between scheduling a sample and hearing it. */
  readonly latency: number;
  resume(): void;
  /** Play `duration` seconds of `buffer` from `offset`, starting at output time `when`, at `gain`. */
  playBuffer(buffer: AudioBuffer, when: number, offset: number, duration: number, gain: number): AudioVoice;
}

/** A scheduled stretch of sound. */
export interface AudioVoice {
  stop(): void;
  /** Change the level while it plays. */
  setGain(gain: number): void;
}

export interface AudioControllerOptions {
  backend?: AudioBackend;
  output?: AudioOutput;
  /** How far ahead of the playhead audio is decoded and scheduled, seconds. */
  lookaheadSeconds?: number;
  /** Gap between start() and the first sample, so the first chunks can be scheduled on time. */
  startDelaySeconds?: number;
}

interface ActiveLayer {
  layer: Layer;
  url: string;
  /** Source time where decoding starts. */
  sourceStart: number;
  iterator: AsyncGenerator<AudioChunk, void, unknown> | null;
  /** Composition time up to which audio has been scheduled. */
  scheduledUntil: number;
  pulling: boolean;
  done: boolean;
  /** Current linear gain: layer volume, 0 when muted, hidden or removed. */
  gain: number;
  voices: { voice: AudioVoice; until: number }[];
}

/** Minimum lead between "now" and a scheduled sample, seconds. */
const SCHEDULE_MARGIN = 0.01;

export function isAudible(layer: Layer): boolean {
  return (layer.type === 'audio' || layer.type === 'video') && layer.visible && !!layer.content.mediaUrl;
}

/**
 * Decodes the audio of every audible layer ahead of the playhead and schedules it on the
 * output clock. While it runs, that clock is the transport's master clock:
 *
 *   compTime = anchorComp + (output.now() - latency - anchorOutput)
 *
 * Audio is scheduled against the same anchor, so video, which is drawn for `compTime`,
 * cannot drift from what is heard. The anchor is reset on play, seek and loop wrap.
 */
export class AudioController {
  private readonly backend: AudioBackend;
  private readonly output: AudioOutput;
  private readonly lookahead: number;
  private readonly startDelay: number;
  private readonly sources = new Map<string, Promise<AudioClipSource | null>>();
  private active: ActiveLayer[] = [];
  private composition: Composition | null = null;
  private running = false;
  private anchorOutput = 0;
  private anchorComp = 0;
  private epoch = 0;

  constructor(options: AudioControllerOptions = {}) {
    this.backend = options.backend ?? new MediabunnyAudioBackend();
    this.output = options.output ?? audioEngine;
    this.lookahead = Math.max(0.05, options.lookaheadSeconds ?? 1);
    this.startDelay = Math.max(0, options.startDelaySeconds ?? 0.05);
  }

  /** (Re)start audio so that composition time `time` is heard now. */
  start(composition: Composition, time: number): void {
    this.stop();
    this.composition = composition;
    this.running = true;
    this.epoch += 1;
    this.output.resume();
    this.anchorOutput = this.output.now() + this.startDelay;
    this.anchorComp = time;

    for (const layer of composition.layers) {
      if (!isAudible(layer) || time >= layer.start + layer.duration) continue;
      const url = layer.content.mediaUrl as string;
      const sourceStart = Math.max(0, (layer.content.mediaInPoint ?? 0) + Math.max(0, time - layer.start));
      this.active.push({
        layer,
        url,
        sourceStart,
        iterator: null,
        scheduledUntil: Math.max(time, layer.start),
        pulling: false,
        done: false,
        gain: layerGain(layer),
        voices: [],
      });
    }
    this.sync();
  }

  stop(): void {
    this.epoch += 1;
    this.running = false;
    for (const layer of this.active) {
      for (const { voice } of layer.voices) voice.stop();
      layer.voices = [];
      void layer.iterator?.return(undefined).catch(() => undefined);
    }
    this.active = [];
  }

  /** Top up the scheduled audio. Cheap; called every frame while playing. */
  sync(): void {
    if (!this.running) return;
    const now = this.output.now();
    for (const layer of this.active) {
      layer.voices = layer.voices.filter((v) => v.until > now); // forget voices that have finished
      if (!layer.pulling && !layer.done) void this.pull(layer, this.epoch);
    }
  }

  /**
   * Apply the composition's current mix settings (volume, mute, visibility) to the audio that is
   * already playing and scheduled, so a fader or a mute button acts immediately.
   */
  syncLayers(composition: Composition): void {
    if (!this.running) return;
    this.composition = composition;
    for (const active of this.active) {
      const layer = composition.layers.find((l) => l.id === active.layer.id);
      const gain = layer && layer.visible ? layerGain(layer) : 0;
      if (gain === active.gain) continue;
      active.gain = gain;
      for (const { voice } of active.voices) voice.setGain(gain);
    }
  }

  /**
   * Composition time according to the audio clock, or null when audio is not driving the
   * transport (not playing, no audio device, or the browser has not let the context run yet).
   */
  clockTime(): number | null {
    if (!this.running || this.output.state !== 'running') return null;
    return this.playheadComp();
  }

  /** Forget a decoded file (asset deleted or relinked). */
  release(url: string): void {
    const pending = this.sources.get(url);
    this.sources.delete(url);
    void pending?.then((source) => source?.dispose()).catch(() => undefined);
  }

  reset(): void {
    this.stop();
    for (const url of [...this.sources.keys()]) this.release(url);
  }

  dispose(): void {
    this.reset();
  }

  // ---------------------------------------------------------------------------

  private playheadComp(): number {
    const elapsed = this.output.now() - this.output.latency - this.anchorOutput;
    return this.anchorComp + Math.max(0, elapsed);
  }

  private openSource(url: string): Promise<AudioClipSource | null> {
    let promise = this.sources.get(url);
    if (!promise) {
      promise = this.backend.open(url).catch(() => null); // no audio is better than a failed play
      this.sources.set(url, promise);
    }
    return promise;
  }

  private async pull(layer: ActiveLayer, epoch: number): Promise<void> {
    layer.pulling = true;
    try {
      if (!layer.iterator) {
        const source = await this.openSource(layer.url);
        if (epoch !== this.epoch) return;
        if (!source) {
          layer.done = true;
          return;
        }
        layer.iterator = source.chunks(layer.sourceStart);
      }
      const layerEnd = layer.layer.start + layer.layer.duration;
      while (epoch === this.epoch && !layer.done) {
        if (layer.scheduledUntil >= this.playheadComp() + this.lookahead) return;
        if (layer.scheduledUntil >= layerEnd) {
          layer.done = true;
          return;
        }
        const next = await layer.iterator.next();
        if (epoch !== this.epoch) return;
        if (next.done) {
          layer.done = true;
          return;
        }
        this.schedule(layer, next.value);
      }
    } catch {
      layer.done = true; // a decode error silences this layer; playback goes on
    } finally {
      layer.pulling = false;
    }
  }

  private schedule(active: ActiveLayer, chunk: AudioChunk): void {
    const { layer } = active;
    const inPoint = layer.content.mediaInPoint ?? 0;
    const chunkStart = layer.start + chunk.timestamp - inPoint;
    const chunkEnd = chunkStart + chunk.duration;
    const layerEnd = layer.start + layer.duration;

    // Late chunks (the source opened slowly) are trimmed to what can still be scheduled instead of
    // being played out of sync. This is deliberately not the playhead: before the first sample
    // (start delay) the playhead is clamped at the anchor, but the output clock is still before it.
    const earliest = this.anchorComp + (this.output.now() + SCHEDULE_MARGIN - this.anchorOutput);
    const from = Math.max(chunkStart, active.scheduledUntil, earliest, layer.start);
    const to = Math.min(chunkEnd, layerEnd);
    active.scheduledUntil = Math.max(active.scheduledUntil, to);
    if (to - from <= 1e-4) return;

    const when = this.anchorOutput + (from - this.anchorComp);
    const voice = this.output.playBuffer(chunk.buffer, when, from - chunkStart, to - from, active.gain);
    active.voices.push({ voice, until: when + (to - from) });
  }
}
