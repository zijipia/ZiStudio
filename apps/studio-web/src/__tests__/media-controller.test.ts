import { describe, expect, it, vi } from 'vitest';
import type { MediaBackend, MediaFrame, MediaKind, MediaMetadata, MediaSource } from '../media';
import { createSolidLayer, type Layer } from '../model';
import { MediaController } from '../runtime/media-controller';
import { computeMediaTime } from '../runtime/media-time';

class FakeSource implements MediaSource {
  readonly id = crypto.randomUUID();
  metadata: MediaMetadata;
  decodes: number[] = [];
  disposed = false;
  constructor(readonly url: string, kind: MediaKind, private readonly delayMs = 0, private readonly fail = false) {
    this.metadata = { kind, duration: 10, width: 640, height: 360 };
  }
  async load() {
    return this.metadata;
  }
  async seek() {}
  async getFrame(time: number): Promise<MediaFrame | null> {
    if (this.fail) throw new Error('decode failed');
    this.decodes.push(time);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    // tag the frame with its url so tests can detect cross-clip mixing
    return { timestamp: time, width: 640, height: 360, source: { url: this.url } as unknown as CanvasImageSource, close: vi.fn() };
  }
  dispose() {
    this.disposed = true;
  }
}

function fakeBackend(opts: { delayMs?: number; failUrls?: string[] } = {}) {
  const sources = new Map<string, FakeSource>();
  const backend: MediaBackend = {
    name: 'fake',
    supportsHardwareDecode: false,
    async open(url, kind = 'video') {
      if (opts.failUrls?.includes(url)) throw new Error('cannot open');
      const s = new FakeSource(url, kind, opts.delayMs);
      sources.set(url, s);
      return s;
    },
  };
  return { backend, sources };
}

function videoLayer(url: string, start = 0, inPoint = 0): Layer {
  const layer = createSolidLayer('v', '#000');
  layer.type = 'video';
  layer.start = start;
  layer.duration = 5;
  layer.content = { mediaUrl: url, mediaInPoint: inPoint };
  return layer;
}

const flush = () => new Promise((r) => setTimeout(r, 5));

describe('computeMediaTime', () => {
  it('applies start and in-point, clamps to [0, duration)', () => {
    const l = videoLayer('a', 2, 3);
    expect(computeMediaTime(l, 2.5)).toBeCloseTo(3.5);
    expect(computeMediaTime(l, 0)).toBeCloseTo(1); // before start: in-point + negative offset
    expect(computeMediaTime(videoLayer('a', 5, 0), 0)).toBe(0);
    expect(computeMediaTime(l, 100, 10)).toBeLessThan(10);
  });
});

describe('MediaController', () => {
  it('reports loading, then ready with a frame after decode', async () => {
    const { backend } = fakeBackend();
    const mc = new MediaController({ backend });
    const layer = videoLayer('a.mp4');
    expect(mc.resolve(layer, 1).status).toBe('loading');
    await flush();
    const first = mc.resolve(layer, 1); // triggers decode
    expect(first.frame).toBeNull();
    await flush();
    const second = mc.resolve(layer, 1);
    expect(second.status).toBe('ready');
    expect(second.frame?.timestamp).toBeCloseTo(1);
  });

  it('notifies subscribers when a frame becomes available', async () => {
    const { backend } = fakeBackend();
    const mc = new MediaController({ backend });
    const listener = vi.fn();
    mc.subscribe(listener);
    const layer = videoLayer('a.mp4');
    mc.resolve(layer, 0);
    await flush();
    mc.resolve(layer, 0);
    await flush();
    expect(listener).toHaveBeenCalled();
  });

  it('never serves one clip\'s frame for another clip at the same time', async () => {
    const { backend } = fakeBackend();
    const mc = new MediaController({ backend });
    const a = videoLayer('a.mp4');
    const b = videoLayer('b.mp4');
    for (const l of [a, b]) mc.resolve(l, 1);
    await flush();
    for (const l of [a, b]) mc.resolve(l, 1);
    await flush();
    const fa = mc.resolve(a, 1).frame!;
    const fb = mc.resolve(b, 1).frame!;
    expect((fa.source as any).url).toBe('a.mp4');
    expect((fb.source as any).url).toBe('b.mp4');
  });

  it('coalesces rapid requests: latest time wins while a decode is in flight', async () => {
    const { backend, sources } = fakeBackend({ delayMs: 20 });
    const mc = new MediaController({ backend });
    const layer = videoLayer('a.mp4');
    mc.resolve(layer, 0);
    await new Promise((r) => setTimeout(r, 30));
    for (const t of [0.0, 0.5, 1.0, 1.5, 2.0]) mc.resolve(layer, t);
    await new Promise((r) => setTimeout(r, 120));
    const decoded = sources.get('a.mp4')!.decodes;
    expect(decoded[0]).toBeCloseTo(0);
    expect(decoded[decoded.length - 1]).toBeCloseTo(2.0);
    expect(decoded.length).toBeLessThan(5);
  });

  it('applies the in-point when mapping to media time', async () => {
    const { backend, sources } = fakeBackend();
    const mc = new MediaController({ backend });
    const layer = videoLayer('a.mp4', 2, 4);
    mc.resolve(layer, 3);
    await flush();
    mc.resolve(layer, 3);
    await flush();
    expect(sources.get('a.mp4')!.decodes[0]).toBeCloseTo(5);
  });

  it('surfaces open errors as an error status', async () => {
    const { backend } = fakeBackend({ failUrls: ['bad.mp4'] });
    const mc = new MediaController({ backend });
    const layer = videoLayer('bad.mp4');
    mc.resolve(layer, 0);
    await flush();
    expect(mc.resolve(layer, 0).status).toBe('error');
    await expect(mc.probe('bad.mp4', 'video')).rejects.toThrow();
  });

  it('prefetch decodes the frame each active layer needs', async () => {
    const { backend, sources } = fakeBackend();
    const mc = new MediaController({ backend });
    const comp = { id: 'c', name: 'c', width: 1920, height: 1080, fps: 30, duration: 10, layers: [videoLayer('a.mp4'), videoLayer('b.mp4', 3)] };
    await mc.prefetch(comp, 1);
    expect(sources.get('a.mp4')!.decodes).toHaveLength(1);
    expect(sources.has('b.mp4')).toBe(false); // inactive at t=1
    expect(mc.resolve(comp.layers[0], 1).frame).not.toBeNull();
  });

  it('release/dispose tear sources down', async () => {
    const { backend, sources } = fakeBackend();
    const mc = new MediaController({ backend });
    await mc.probe('a.mp4', 'video');
    mc.release('a.mp4');
    expect(sources.get('a.mp4')!.disposed).toBe(true);
    await mc.probe('b.mp4', 'video');
    mc.dispose();
    expect(sources.get('b.mp4')!.disposed).toBe(true);
  });
});

describe('MediaController with frame-accurate sources', () => {
  /** Returns the frame *covering* the requested time (timestamp <= t < timestamp + duration), like WebCodecs. */
  function coveringBackend(fps = 30, durationKnown = true) {
    const decodes: number[] = [];
    const backend: MediaBackend = {
      name: 'covering',
      supportsHardwareDecode: false,
      async open(url, kind = 'video') {
        const meta: MediaMetadata = { kind, duration: 10, width: 64, height: 36 };
        const source: MediaSource = {
          id: 's', url, metadata: meta,
          load: async () => meta,
          seek: async () => {},
          dispose() {},
          async getFrame(t: number) {
            decodes.push(t);
            const ts = Math.floor(t * fps + 1e-6) / fps;
            return { timestamp: ts, duration: durationKnown ? 1 / fps : undefined, width: 64, height: 36, source: {} as CanvasImageSource, close: vi.fn() };
          },
        };
        return source;
      },
    };
    return { backend, decodes };
  }

  it('does not re-decode forever when the right frame starts before the requested time', async () => {
    const { backend, decodes } = coveringBackend();
    const mc = new MediaController({ backend });
    const layer = videoLayer('a.mp4');
    // 0.05s is 0.0167s after the start of the 30fps frame at 0.0333 -> outside the old 1/48 window for t=0.0667
    const t = 0.0583;
    for (let i = 0; i < 40; i += 1) {
      mc.resolve(layer, t);
      await flush();
    }
    expect(decodes.length).toBeLessThanOrEqual(2);
    expect(mc.resolve(layer, t).frame?.timestamp).toBeCloseTo(1 / 30);
  });

  it('shows the frame covering the time (never a nearer future frame)', async () => {
    const { backend } = coveringBackend();
    const mc = new MediaController({ backend });
    const layer = videoLayer('a.mp4');
    for (const t of [0, 1 / 30, 2 / 30]) {
      mc.resolve(layer, t);
      await flush();
      mc.resolve(layer, t);
      await flush();
    }
    // 0.0580 is nearer to the frame at 0.0667 but frame 0.0333 is the one on screen
    expect(mc.resolve(layer, 0.058).frame?.timestamp).toBeCloseTo(1 / 30);
  });

  it('settles when the source can only hold its last frame (past the end), without spinning', async () => {
    const { backend, decodes } = coveringBackend();
    const mc = new MediaController({ backend });
    const layer = videoLayer('a.mp4');
    for (let i = 0; i < 40; i += 1) {
      mc.resolve(layer, 9.999);
      await flush();
    }
    expect(decodes.length).toBeLessThanOrEqual(2);
  });

  it('also settles for sources that report no frame duration', async () => {
    const { backend, decodes } = coveringBackend(30, false);
    const mc = new MediaController({ backend });
    const layer = videoLayer('a.mp4');
    for (let i = 0; i < 40; i += 1) {
      mc.resolve(layer, 0.0583);
      await flush();
    }
    expect(decodes.length).toBeLessThanOrEqual(2);
  });
});
