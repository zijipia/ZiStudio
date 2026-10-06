import { describe, expect, it, vi } from 'vitest';
import type { MediaBackend, MediaFrame, MediaKind, MediaMetadata, MediaSource } from '../media';
import { createSolidLayer, type Layer } from '../model';
import { MediaController } from '../runtime/media-controller';

const FPS = 30;
const FRAME_BYTES = 640 * 360 * 4;

/** A source that decodes sequentially and cheaply, like the WebCodecs one. */
class SeqSource implements MediaSource {
  readonly id = crypto.randomUUID();
  readonly metadata: MediaMetadata = { kind: 'video', duration: 10, width: 640, height: 360 };
  decodes: number[] = [];
  closed: MediaFrame[] = [];
  constructor(readonly url: string, readonly supportsPrefetch: boolean) {}
  async load() {
    return this.metadata;
  }
  async seek() {}
  async getFrame(time: number): Promise<MediaFrame | null> {
    const index = Math.floor(time * FPS + 0.05);
    this.decodes.push(index);
    await Promise.resolve();
    const frame: MediaFrame = {
      timestamp: index / FPS,
      duration: 1 / FPS,
      width: 640,
      height: 360,
      source: {} as CanvasImageSource,
      close: vi.fn(),
    };
    return frame;
  }
  dispose() {}
}

function setup(prefetch = true, options: ConstructorParameters<typeof MediaController>[0] = {}) {
  let source!: SeqSource;
  const backend: MediaBackend = {
    name: 'fake',
    supportsHardwareDecode: false,
    async open(url: string, _kind?: MediaKind) {
      source = new SeqSource(url, prefetch);
      return source;
    },
  };
  const mc = new MediaController({ backend, ...options });
  const layer: Layer = Object.assign(createSolidLayer('v', '#000'), { type: 'video' as const, start: 0, duration: 9 });
  layer.content = { mediaUrl: 'a.mp4', mediaInPoint: 0 };
  return { mc, layer, source: () => source };
}

const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/** Open the source and put frame 0 on screen. */
async function warmUp(mc: MediaController, layer: Layer) {
  mc.resolve(layer, 0);
  await wait();
  mc.resolve(layer, 0);
  await wait();
}

describe('decode-ahead', () => {
  it('does not decode ahead while paused', async () => {
    const { mc, layer, source } = setup();
    await warmUp(mc, layer);
    mc.resolve(layer, 0);
    await wait();
    expect(source().decodes).toEqual([0]);
  });

  it('decodes the lookahead window after the playhead while playing', async () => {
    const { mc, layer, source } = setup(true, { lookaheadSeconds: 0.5 });
    await warmUp(mc, layer);
    mc.setPlaying(true);
    mc.resolve(layer, 0);
    await wait();
    const decoded = source().decodes;
    expect(decoded[decoded.length - 1]).toBeGreaterThanOrEqual(14); // 0.5s * 30fps
    expect(decoded.length).toBeLessThanOrEqual(17);
    expect(decoded).toEqual([...decoded].sort((a, b) => a - b)); // sequential, never backwards
  });

  it('serves the playhead from already decoded frames without decoding on demand', async () => {
    const { mc, layer, source } = setup(true, { lookaheadSeconds: 0.5 });
    await warmUp(mc, layer);
    mc.setPlaying(true);
    mc.resolve(layer, 0);
    await wait();
    for (let i = 1; i <= 8; i += 1) {
      const r = mc.resolve(layer, i / FPS);
      expect(r.status).toBe('ready');
      expect(r.frame?.timestamp).toBeCloseTo(i / FPS, 5);
    }
    // every frame was decoded exactly once, by decode-ahead: playback never re-decoded one on demand
    const decoded = source().decodes;
    expect(new Set(decoded).size).toBe(decoded.length);
  });

  it('stops at the memory budget instead of evicting frames that are about to be shown', async () => {
    const budget = FRAME_BYTES * 6;
    const { mc, layer, source } = setup(true, { lookaheadSeconds: 5, maxCacheBytes: budget, maxCachedFramesPerSource: 100 });
    await warmUp(mc, layer);
    mc.setPlaying(true);
    mc.resolve(layer, 0);
    await wait(40);
    const stats = mc.getStats();
    expect(stats.bytes).toBeLessThanOrEqual(budget);
    expect(stats.frames).toBe(6);
    const decoded = source().decodes;
    expect(decoded[decoded.length - 1]).toBe(5); // frames 0..5, nothing beyond the budget
  });

  it('continues once the playhead moves on and frees room', async () => {
    const budget = FRAME_BYTES * 6;
    const { mc, layer, source } = setup(true, { lookaheadSeconds: 5, maxCacheBytes: budget, maxCachedFramesPerSource: 100 });
    await warmUp(mc, layer);
    mc.setPlaying(true);
    mc.resolve(layer, 0);
    await wait(40);
    mc.resolve(layer, 4 / FPS); // playhead passed frames 0..3
    await wait(40);
    const decoded = source().decodes;
    expect(decoded[decoded.length - 1]).toBeGreaterThan(5);
    expect(mc.getStats().bytes).toBeLessThanOrEqual(budget);
  });

  it('splits one budget between open video sources', async () => {
    const backend: MediaBackend = {
      name: 'fake',
      supportsHardwareDecode: false,
      async open(url: string) {
        return new SeqSource(url, true);
      },
    };
    const budget = FRAME_BYTES * 8;
    const mc = new MediaController({ backend, maxCacheBytes: budget, lookaheadSeconds: 5, maxCachedFramesPerSource: 100 });
    const a = Object.assign(createSolidLayer('a', '#000'), { type: 'video' as const, duration: 9 });
    a.content = { mediaUrl: 'a.mp4' };
    const b = Object.assign(createSolidLayer('b', '#000'), { type: 'video' as const, duration: 9 });
    b.content = { mediaUrl: 'b.mp4' };
    for (const l of [a, b]) mc.resolve(l, 0);
    await wait();
    for (const l of [a, b]) mc.resolve(l, 0);
    await wait();
    mc.setPlaying(true);
    for (const l of [a, b]) mc.resolve(l, 0);
    await wait(60);
    const stats = mc.getStats();
    expect(stats.sources).toBe(2);
    expect(stats.bytes).toBeLessThanOrEqual(budget);
  });

  it('abandons decode-ahead when the playhead jumps', async () => {
    const { mc, layer, source } = setup(true, { lookaheadSeconds: 0.5 });
    await warmUp(mc, layer);
    mc.setPlaying(true);
    mc.resolve(layer, 0);
    await wait();
    mc.resolve(layer, 6); // seek far away
    await wait();
    mc.resolve(layer, 6);
    await wait();
    const decoded = source().decodes;
    expect(decoded[decoded.length - 1]).toBeGreaterThanOrEqual(6 * FPS);
  });

  it('cancels decode-ahead on pause', async () => {
    const { mc, layer, source } = setup(true, { lookaheadSeconds: 5, maxCachedFramesPerSource: 1000 });
    await warmUp(mc, layer);
    mc.setPlaying(true);
    mc.resolve(layer, 0);
    mc.setPlaying(false);
    await wait(40);
    expect(source().decodes.length).toBeLessThan(10);
  });

  it('does not prefetch sources that cannot decode cheaply (browser fallback)', async () => {
    const { mc, layer, source } = setup(false, { lookaheadSeconds: 0.5 });
    await warmUp(mc, layer);
    mc.setPlaying(true);
    mc.resolve(layer, 0);
    await wait();
    expect(source().decodes).toEqual([0]);
  });

  it('can be disabled with lookaheadSeconds: 0', async () => {
    const { mc, layer, source } = setup(true, { lookaheadSeconds: 0 });
    await warmUp(mc, layer);
    mc.setPlaying(true);
    mc.resolve(layer, 0);
    await wait();
    expect(source().decodes).toEqual([0]);
  });

  it('stops at the end of the media', async () => {
    const { mc, layer, source } = setup(true, { lookaheadSeconds: 5, maxCachedFramesPerSource: 1000 });
    layer.content.mediaInPoint = 9.9; // 0.1s left in a 10s clip
    await warmUp(mc, layer);
    mc.setPlaying(true);
    mc.resolve(layer, 0);
    await wait(60);
    const decoded = source().decodes;
    expect(decoded[decoded.length - 1]).toBeLessThanOrEqual(10 * FPS);
    expect(decoded.length).toBeLessThan(20);
  });
});
