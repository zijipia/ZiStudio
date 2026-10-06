import { describe, expect, it } from 'vitest';
import type { AudioBackend, AudioChunk, AudioClipSource } from '../demux/audio-source';
import { createSolidLayer, type Composition, type Layer } from '../model';
import { CompositionAudioMixer, type MixedBlock } from '../runtime/audio-mixer';

const CHUNK = 0.1;

interface SourceOptions {
  /** Sample value as a function of media time (seconds). */
  f: (t: number) => number;
  rate?: number;
  channels?: number;
  length?: number; // seconds of media
  failAfter?: number; // throw when asked for the chunk starting at/after this media time
}

class FakeSource implements AudioClipSource {
  disposed = false;
  returned = 0;
  constructor(private readonly o: SourceOptions) {}
  async *chunks(start: number): AsyncGenerator<AudioChunk, void, unknown> {
    const { f, rate = 8000, channels = 1, length = 10, failAfter } = this.o;
    try {
      for (let i = Math.floor(start / CHUNK + 1e-6); i * CHUNK < length; i += 1) {
        const ts = i * CHUNK;
        if (failAfter !== undefined && ts >= failAfter) throw new Error('decode error');
        const n = Math.round(CHUNK * rate);
        const planes = Array.from({ length: channels }, (_, c) =>
          Float32Array.from({ length: n }, (_, k) => f(ts + k / rate) * (c === 0 ? 1 : -1))
        );
        const buffer = {
          sampleRate: rate,
          length: n,
          numberOfChannels: channels,
          getChannelData: (c: number) => planes[c],
        } as unknown as AudioBuffer;
        yield { timestamp: ts, duration: CHUNK, buffer };
      }
    } finally {
      this.returned += 1;
    }
  }
  dispose() {
    this.disposed = true;
  }
}

function backend(sources: Record<string, FakeSource | null>): AudioBackend {
  return { open: async (url) => sources[url] ?? null };
}

function layer(url: string, start: number, duration: number, inPoint = 0, type: Layer['type'] = 'audio'): Layer {
  const l = createSolidLayer(url, '#000');
  l.type = type;
  l.start = start;
  l.duration = duration;
  l.content = { mediaUrl: url, mediaInPoint: inPoint };
  return l;
}

function comp(duration: number, ...layers: Layer[]): Composition {
  return { id: 'c', name: 'c', width: 10, height: 10, fps: 30, duration, layers };
}

const RATE = 8000;

async function mixAll(c: Composition, b: AudioBackend, blockSeconds = 1): Promise<{ blocks: MixedBlock[]; ch: Float32Array[] }> {
  const mixer = await CompositionAudioMixer.open(c, { backend: b, sampleRate: RATE, channels: 2, blockSeconds });
  const blocks: MixedBlock[] = [];
  for (let block = await mixer.nextBlock(); block; block = await mixer.nextBlock()) blocks.push(block);
  await mixer.dispose();
  const ch = [0, 1].map((c) => {
    const total = blocks.reduce((n, b) => n + b.channels[c].length, 0);
    const out = new Float32Array(total);
    let at = 0;
    for (const b of blocks) {
      out.set(b.channels[c], at);
      at += b.channels[c].length;
    }
    return out;
  });
  return { blocks, ch };
}

describe('CompositionAudioMixer', () => {
  it('produces exactly duration * sampleRate samples, in timestamped blocks', async () => {
    const { blocks, ch } = await mixAll(comp(2.5, layer('a', 0, 2.5)), backend({ a: new FakeSource({ f: () => 0.25 }) }));
    expect(ch[0].length).toBe(2.5 * RATE);
    expect(blocks.map((b) => b.timestamp)).toEqual([0, 1, 2]);
    expect(blocks[2].channels[0].length).toBe(0.5 * RATE);
  });

  it('plays a mono source on both channels at the right level', async () => {
    const { ch } = await mixAll(comp(1, layer('a', 0, 1)), backend({ a: new FakeSource({ f: () => 0.25 }) }));
    expect(ch[0][0]).toBeCloseTo(0.25);
    expect(ch[0][4000]).toBeCloseTo(0.25);
    expect(ch[1][4000]).toBeCloseTo(0.25);
  });

  it('keeps stereo channels apart', async () => {
    const { ch } = await mixAll(comp(1, layer('a', 0, 1)), backend({ a: new FakeSource({ f: () => 0.5, channels: 2 }) }));
    expect(ch[0][100]).toBeCloseTo(0.5);
    expect(ch[1][100]).toBeCloseTo(-0.5);
  });

  it('places a layer on the timeline: silence before start, silence after the end', async () => {
    const { ch } = await mixAll(comp(2, layer('a', 0.5, 1)), backend({ a: new FakeSource({ f: () => 0.3 }) }));
    expect(ch[0][0.25 * RATE]).toBe(0);
    expect(ch[0][0.5 * RATE + 10]).toBeCloseTo(0.3);
    expect(ch[0][1.25 * RATE]).toBeCloseTo(0.3);
    expect(ch[0][1.5 * RATE + 10]).toBe(0);
    expect(ch[0][1.9 * RATE]).toBe(0);
  });

  it('applies the layer volume, and skips muted layers without decoding them', async () => {
    const quiet = Object.assign(layer('a', 0, 1), { audio: { volume: 0.5, muted: false } });
    const { ch } = await mixAll(comp(1, quiet), backend({ a: new FakeSource({ f: () => 0.4 }) }));
    expect(ch[0][500]).toBeCloseTo(0.2);

    let opened = 0;
    const counting: AudioBackend = { open: async () => (opened += 1, new FakeSource({ f: () => 0.4 })) };
    const muted = Object.assign(layer('a', 0, 1), { audio: { volume: 1, muted: true } });
    const mixer = await CompositionAudioMixer.open(comp(1, muted), { backend: counting, sampleRate: RATE });
    expect(mixer.hasAudio).toBe(false);
    expect(opened).toBe(0);
    await mixer.dispose();
  });

  it('maps the media in-point to the layer start', async () => {
    // the media is a ramp of its own time; the layer plays it from 3s
    const { ch } = await mixAll(comp(1, layer('a', 0, 1, 3)), backend({ a: new FakeSource({ f: (t) => t / 10 }) }));
    expect(ch[0][0]).toBeCloseTo(0.3, 3);
    expect(ch[0][0.5 * RATE]).toBeCloseTo(0.35, 3);
  });

  it('sums layers and clamps the result to [-1, 1]', async () => {
    const b = backend({ a: new FakeSource({ f: () => 0.4 }), b: new FakeSource({ f: () => 0.4 }), c: new FakeSource({ f: () => 0.9 }) });
    const sum = await mixAll(comp(1, layer('a', 0, 1), layer('b', 0, 1)), b);
    expect(sum.ch[0][500]).toBeCloseTo(0.8);
    const clipped = await mixAll(comp(1, layer('a', 0, 1), layer('c', 0, 1)), b);
    expect(clipped.ch[0][500]).toBe(1);
  });

  it('resamples a lower-rate source with linear interpolation', async () => {
    // 2 kHz source holding a ramp of its own time, mixed at 8 kHz
    const { ch } = await mixAll(comp(1, layer('a', 0, 1)), backend({ a: new FakeSource({ f: (t) => t / 10, rate: 2000 }) }));
    for (const k of [10, 1000, 4001, 7000]) expect(ch[0][k]).toBeCloseTo(k / RATE / 10, 4);
  });

  it('is independent of the block size (chunks straddling blocks are not cut)', async () => {
    const make = () => backend({ a: new FakeSource({ f: (t) => Math.sin(t * 40) * 0.5, rate: 11025 }) });
    const c = comp(3, layer('a', 0.13, 2.4, 1.07));
    const one = await mixAll(c, make(), 3);
    const small = await mixAll(c, make(), 0.37);
    expect(small.ch[0].length).toBe(one.ch[0].length);
    let worst = 0;
    for (let i = 0; i < one.ch[0].length; i += 1) worst = Math.max(worst, Math.abs(one.ch[0][i] - small.ch[0][i]));
    expect(worst).toBeLessThan(1e-6);
  });

  it('mixes the audio of video layers and ignores hidden and media-less layers', async () => {
    const hidden = Object.assign(layer('b', 0, 1), { visible: false });
    const synth = Object.assign(layer('c', 0, 1), { content: { audioFreq: 440 } });
    const { ch } = await mixAll(
      comp(1, layer('a', 0, 1, 0, 'video'), hidden, synth),
      backend({ a: new FakeSource({ f: () => 0.1 }), b: new FakeSource({ f: () => 0.5 }), c: new FakeSource({ f: () => 0.5 }) })
    );
    expect(ch[0][100]).toBeCloseTo(0.1);
  });

  it('reports hasAudio=false when nothing decodes, and lets one broken file go silent', async () => {
    const none = await CompositionAudioMixer.open(comp(1, layer('a', 0, 1)), { backend: backend({ a: null }) });
    expect(none.hasAudio).toBe(false);
    await none.dispose();

    const { ch } = await mixAll(
      comp(1, layer('a', 0, 1), layer('b', 0, 1)),
      backend({ a: new FakeSource({ f: () => 0.2, failAfter: 0.5 }), b: new FakeSource({ f: () => 0.1 }) })
    );
    expect(ch[0][0.25 * RATE]).toBeCloseTo(0.3); // both
    expect(ch[0][0.75 * RATE]).toBeCloseTo(0.1); // a failed at 0.5s: only b remains
  });

  it('opens a file shared by several layers once and disposes every source', async () => {
    const shared = new FakeSource({ f: () => 0.1 });
    let opens = 0;
    const b: AudioBackend = { open: async () => (opens += 1, shared) };
    const mixer = await CompositionAudioMixer.open(comp(2, layer('a', 0, 1), layer('a', 1, 1)), { backend: b, sampleRate: RATE });
    expect(opens).toBe(1);
    await mixer.nextBlock();
    await mixer.dispose();
    expect(shared.disposed).toBe(true);
  });

  it('stops when the export is aborted', async () => {
    const controller = new AbortController();
    const mixer = await CompositionAudioMixer.open(comp(3, layer('a', 0, 3)), {
      backend: backend({ a: new FakeSource({ f: () => 0.1 }) }),
      sampleRate: RATE,
      signal: controller.signal,
    });
    await mixer.nextBlock();
    controller.abort();
    await expect(mixer.nextBlock()).rejects.toMatchObject({ name: 'AbortError' });
    await mixer.dispose();
  });

  it('tracks progress through mixedUntil/finished', async () => {
    const mixer = await CompositionAudioMixer.open(comp(2, layer('a', 0, 2)), {
      backend: backend({ a: new FakeSource({ f: () => 0.1 }) }),
      sampleRate: RATE,
    });
    expect(mixer.mixedUntil).toBe(0);
    await mixer.nextBlock();
    expect(mixer.mixedUntil).toBe(1);
    expect(mixer.finished).toBe(false);
    await mixer.nextBlock();
    expect(mixer.finished).toBe(true);
    expect(await mixer.nextBlock()).toBeNull();
    await mixer.dispose();
  });
});
