import { describe, expect, it, vi } from 'vitest';
import type { AudioBackend, AudioChunk, AudioClipSource } from '../demux/audio-source';
import { createSolidLayer, type Composition, type Layer } from '../model';
import { AudioController, type AudioOutput } from '../runtime/audio-controller';

const CHUNK = 0.1;

class FakeOutput implements AudioOutput {
  state: 'running' | 'suspended' | 'unavailable' = 'running';
  time = 100; // arbitrary base: the output clock does not start at 0
  latency = 0;
  played: {
    when: number;
    offset: number;
    duration: number;
    gain: number;
    stop: ReturnType<typeof vi.fn>;
    setGain: ReturnType<typeof vi.fn>;
  }[] = [];
  resumed = 0;
  now() {
    return this.time;
  }
  resume() {
    this.resumed += 1;
  }
  playBuffer(_b: AudioBuffer, when: number, offset: number, duration: number, gain: number) {
    const stop = vi.fn();
    const setGain = vi.fn();
    this.played.push({ when, offset, duration, gain, stop, setGain });
    return { stop, setGain };
  }
}

/** 10s of audio in 0.1s chunks, aligned to the chunk grid. */
class FakeSource implements AudioClipSource {
  started: number[] = [];
  disposed = false;
  async *chunks(start: number): AsyncGenerator<AudioChunk, void, unknown> {
    this.started.push(start);
    for (let i = Math.floor(start / CHUNK + 1e-6); i * CHUNK < 10; i += 1) {
      yield { timestamp: i * CHUNK, duration: CHUNK, buffer: {} as AudioBuffer };
    }
  }
  dispose() {
    this.disposed = true;
  }
}

function setup(opts: { silent?: boolean } = {}) {
  const output = new FakeOutput();
  const sources: FakeSource[] = [];
  const backend: AudioBackend = {
    open: vi.fn(async () => {
      if (opts.silent) return null;
      const s = new FakeSource();
      sources.push(s);
      return s;
    }),
  };
  const audio = new AudioController({ backend, output, lookaheadSeconds: 1, startDelaySeconds: 0.05 });
  return { audio, output, backend, sources };
}

function audioLayer(start = 0, duration = 5, inPoint = 0, type: Layer['type'] = 'audio'): Layer {
  const layer = createSolidLayer('a', '#000');
  layer.type = type;
  layer.start = start;
  layer.duration = duration;
  layer.content = { mediaUrl: 'a.wav', mediaInPoint: inPoint };
  return layer;
}

function comp(...layers: Layer[]): Composition {
  return { id: 'c', name: 'c', width: 10, height: 10, fps: 30, duration: 10, layers };
}

const flush = () => new Promise((r) => setTimeout(r, 10));

describe('AudioController scheduling', () => {
  it('schedules the lookahead window on the output clock, anchored at start()', async () => {
    const { audio, output } = setup();
    audio.start(comp(audioLayer()), 0);
    await flush();
    expect(output.resumed).toBe(1);
    const first = output.played[0];
    expect(first.when).toBeCloseTo(100.05); // output.now() + start delay
    expect(first.offset).toBeCloseTo(0);
    // lookahead 1s => ~10 chunks, back to back
    expect(output.played.length).toBeGreaterThanOrEqual(10);
    expect(output.played.length).toBeLessThanOrEqual(12);
    for (let i = 1; i < output.played.length; i += 1) {
      const prev = output.played[i - 1];
      expect(output.played[i].when).toBeCloseTo(prev.when + prev.duration, 5);
    }
  });

  it('keeps scheduling as the clock advances (sync) and stays bounded by the lookahead', async () => {
    const { audio, output } = setup();
    audio.start(comp(audioLayer()), 0);
    await flush();
    const before = output.played.length;
    audio.sync();
    await flush();
    expect(output.played.length).toBe(before); // clock has not moved: already ahead enough
    output.time += 0.5;
    audio.sync();
    await flush();
    expect(output.played.length).toBeGreaterThan(before);
  });

  it('starts mid-clip: the first chunk is trimmed to the playhead', async () => {
    const { audio, output, sources } = setup();
    audio.start(comp(audioLayer()), 2.05);
    await flush();
    expect(sources[0].started[0]).toBeCloseTo(2.05);
    const first = output.played[0];
    expect(first.offset).toBeCloseTo(0.05, 2); // skips the 2.00-2.05 part of chunk [2.0, 2.1)
    expect(first.when).toBeCloseTo(100.05, 2);
    expect(first.duration).toBeCloseTo(0.05, 2);
  });

  it('places a delayed clip on the timeline and maps the media in-point', async () => {
    const { audio, output, sources } = setup();
    // layer starts at 0.5s on the timeline and plays the media from 3s in
    audio.start(comp(audioLayer(0.5, 4, 3)), 0);
    await flush();
    expect(sources[0].started[0]).toBeCloseTo(3);
    expect(output.played[0].when).toBeCloseTo(100.05 + 0.5, 3); // 0.5s after the playhead
    expect(output.played[0].offset).toBeCloseTo(0);
  });

  it('does not schedule past the end of the layer', async () => {
    const { audio, output } = setup();
    audio.start(comp(audioLayer(0, 0.35)), 0);
    await flush();
    const total = output.played.reduce((sum, p) => sum + p.duration, 0);
    expect(total).toBeCloseTo(0.35, 3);
  });

  it('trims chunks that arrive late instead of playing them out of sync', async () => {
    const { audio, output } = setup();
    audio.start(comp(audioLayer()), 0);
    output.time += 0.4; // the decoder was slow: the output clock moved on before the first chunk
    await flush();
    // 0.4s late: nothing may be scheduled in the past, and what is left starts right at "now"
    expect(output.played.length).toBeGreaterThan(0);
    expect(output.played.every((p) => p.when >= output.time)).toBe(true);
    expect(output.played[0].when).toBeCloseTo(output.time + 0.01, 3);
    // the chunk [0.3, 0.4) was cut at 0.36 (0.4 - 0.05 start delay + 0.01 margin)
    expect(output.played[0].offset).toBeCloseTo(0.06, 3);
  });

  it('plays the audio of video layers too, and ignores hidden or media-less layers', async () => {
    const { audio, output, backend } = setup();
    const video = audioLayer(0, 5, 0, 'video');
    const hidden = Object.assign(audioLayer(), { visible: false });
    const synth = Object.assign(audioLayer(), { content: { audioFreq: 440 } });
    audio.start(comp(video, hidden, synth), 0);
    await flush();
    expect(backend.open).toHaveBeenCalledTimes(1);
    expect(output.played.length).toBeGreaterThan(0);
  });

  it('decodes each file once for several layers, and survives a file without audio', async () => {
    const a = setup();
    a.audio.start(comp(audioLayer(0, 5), audioLayer(5, 5)), 0);
    await flush();
    expect(a.backend.open).toHaveBeenCalledTimes(1);

    const silent = setup({ silent: true });
    silent.audio.start(comp(audioLayer()), 0);
    await flush();
    expect(silent.output.played.length).toBe(0);
  });

  it('stop() silences everything that was scheduled and ends decoding', async () => {
    const { audio, output } = setup();
    audio.start(comp(audioLayer()), 0);
    await flush();
    const count = output.played.length;
    audio.stop();
    expect(output.played.every((p) => p.stop.mock.calls.length === 1)).toBe(true);
    output.time += 5;
    audio.sync();
    await flush();
    expect(output.played.length).toBe(count);
  });

  it('restarting (seek) cancels the previous schedule and re-anchors', async () => {
    const { audio, output } = setup();
    const c = comp(audioLayer());
    audio.start(c, 0);
    await flush();
    const old = [...output.played];
    output.time += 0.2;
    audio.start(c, 3);
    await flush();
    expect(old.every((p) => p.stop.mock.calls.length === 1)).toBe(true);
    const fresh = output.played[old.length];
    expect(fresh.when).toBeCloseTo(output.time + 0.05, 2);
  });

  it('release() disposes a decoded file', async () => {
    const { audio, sources } = setup();
    audio.start(comp(audioLayer()), 0);
    await flush();
    audio.release('a.wav');
    await flush();
    expect(sources[0].disposed).toBe(true);
  });
});

describe('AudioController clock', () => {
  it('reports composition time from the output clock, minus output latency', () => {
    const { audio, output } = setup();
    expect(audio.clockTime()).toBeNull(); // not playing
    audio.start(comp(audioLayer()), 2);
    expect(audio.clockTime()).toBeCloseTo(2); // still inside the start delay
    output.time += 0.55; // 0.05 delay + 0.5s
    expect(audio.clockTime()).toBeCloseTo(2.5);
    output.latency = 0.1;
    expect(audio.clockTime()).toBeCloseTo(2.4);
  });

  it('is null whenever audio cannot drive the transport', () => {
    const { audio, output } = setup();
    audio.start(comp(audioLayer()), 0);
    output.state = 'suspended';
    expect(audio.clockTime()).toBeNull();
    output.state = 'running';
    expect(audio.clockTime()).not.toBeNull();
    audio.stop();
    expect(audio.clockTime()).toBeNull();
  });

  it('is monotonic and independent of scheduling progress', async () => {
    const { audio, output } = setup({ silent: true }); // no audio data at all
    audio.start(comp(audioLayer()), 0);
    await flush();
    output.time += 0.5; // past the start delay
    const a = audio.clockTime()!;
    output.time += 1;
    expect(audio.clockTime()! - a).toBeCloseTo(1);
  });
});

describe('AudioController mix settings', () => {
  it('schedules audio at the layer volume', async () => {
    const { audio, output } = setup();
    const layer = Object.assign(audioLayer(), { audio: { volume: 0.5, muted: false } });
    audio.start(comp(layer), 0);
    await flush();
    expect(output.played.length).toBeGreaterThan(0);
    expect(output.played.every((p) => p.gain === 0.5)).toBe(true);
  });

  it('keeps a muted layer decodable (so unmuting works) but silent', async () => {
    const { audio, output } = setup();
    const layer = Object.assign(audioLayer(), { audio: { volume: 1, muted: true } });
    audio.start(comp(layer), 0);
    await flush();
    expect(output.played.every((p) => p.gain === 0)).toBe(true);
  });

  it('syncLayers re-levels voices already scheduled and applies to the ones scheduled later', async () => {
    const { audio, output } = setup();
    const layer = audioLayer();
    const c = comp(layer);
    audio.start(c, 0);
    await flush();
    const before = output.played.length;
    const louder = { ...c, layers: [{ ...layer, audio: { volume: 2, muted: false } }] };
    audio.syncLayers(louder);
    expect(output.played.every((p) => p.setGain.mock.calls.at(-1)?.[0] === 2)).toBe(true);
    output.time += 0.5;
    audio.sync();
    await flush();
    expect(output.played.length).toBeGreaterThan(before);
    expect(output.played.slice(before).every((p) => p.gain === 2)).toBe(true);
  });

  it('mutes immediately when the layer is muted, hidden or removed', async () => {
    const { audio, output } = setup();
    const layer = audioLayer();
    audio.start(comp(layer), 0);
    await flush();
    audio.syncLayers(comp({ ...layer, audio: { volume: 1, muted: true } }));
    expect(output.played.every((p) => p.setGain.mock.calls.at(-1)?.[0] === 0)).toBe(true);
    audio.syncLayers(comp({ ...layer, audio: { volume: 1, muted: false } }));
    expect(output.played[0].setGain.mock.calls.at(-1)?.[0]).toBe(1);
    audio.syncLayers(comp({ ...layer, visible: false }));
    expect(output.played[0].setGain.mock.calls.at(-1)?.[0]).toBe(0);
    audio.syncLayers(comp()); // layer deleted
    expect(output.played[0].setGain.mock.calls.at(-1)?.[0]).toBe(0);
  });

  it('forgets voices that have finished playing', async () => {
    const { audio, output } = setup();
    audio.start(comp(audioLayer(0, 8)), 0);
    await flush();
    output.time += 3;
    audio.sync();
    await flush();
    output.time += 3;
    audio.sync();
    await flush();
    // internal bookkeeping must not grow with the playback length
    const active = (audio as unknown as { active: { voices: unknown[] }[] }).active;
    expect(active[0].voices.length).toBeLessThan(25);
  });
});
