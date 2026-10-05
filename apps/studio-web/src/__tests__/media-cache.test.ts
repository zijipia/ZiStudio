import { describe, expect, it, vi } from 'vitest';
import type { MediaFrame } from '../media';
import { MediaFrameCache } from '../media-cache';
import { MediaFrameScheduler } from '../media-scheduler';
import type { MediaSource } from '../media';

function frame(timestamp: number) {
  const close = vi.fn();
  const f: MediaFrame = { timestamp, width: 2, height: 2, source: {} as CanvasImageSource, close };
  return Object.assign(f, { close });
}

describe('MediaFrameCache', () => {
  it('evicts the least recently used frame and closes it', () => {
    const cache = new MediaFrameCache({ maxFrames: 2 });
    const a = frame(1);
    const b = frame(2);
    const c = frame(3);
    cache.set(1, a);
    cache.set(2, b);
    cache.get(1); // a becomes most recent
    cache.set(3, c);
    expect(b.close).toHaveBeenCalledTimes(1);
    expect(a.close).not.toHaveBeenCalled();
    expect(cache.size).toBe(2);
  });

  it('getNearest respects tolerance', () => {
    const cache = new MediaFrameCache();
    const a = frame(1.0);
    cache.set(1.0, a);
    expect(cache.getNearest(1.004, 0.01)).toBe(a);
    expect(cache.getNearest(1.5, 0.01)).toBeUndefined();
  });

  it('clear closes every frame', () => {
    const cache = new MediaFrameCache();
    const a = frame(1);
    const b = frame(2);
    cache.set(1, a);
    cache.set(2, b);
    cache.clear();
    expect(a.close).toHaveBeenCalled();
    expect(b.close).toHaveBeenCalled();
    expect(cache.size).toBe(0);
  });
});

describe('MediaFrameScheduler', () => {
  const sourceReturning = (frames: Record<number, MediaFrame>): MediaSource =>
    ({
      id: 's',
      url: 'x',
      metadata: null,
      load: async () => ({ kind: 'video' as const }),
      seek: async () => {},
      getFrame: async (t: number) => frames[t] ?? null,
      dispose() {},
    }) as MediaSource;

  it('serves repeated requests from cache', async () => {
    const getFrame = vi.fn(async (t: number) => frame(t));
    const src = { ...sourceReturning({}), getFrame } as MediaSource;
    const sched = new MediaFrameScheduler();
    const first = await sched.getFrame(src, 1);
    const second = await sched.getFrame(src, 1);
    expect(first).toBe(second);
    expect(getFrame).toHaveBeenCalledTimes(1);
  });

  it('drops (and closes) a frame superseded by a newer request', async () => {
    const slow = frame(1);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const src = {
      ...sourceReturning({}),
      getFrame: async (t: number) => {
        if (t === 1) {
          await gate;
          return slow;
        }
        return frame(t);
      },
    } as MediaSource;
    const sched = new MediaFrameScheduler();
    const p1 = sched.getFrame(src, 1);
    await sched.getFrame(src, 5);
    release();
    expect(await p1).toBeNull();
    expect(slow.close).toHaveBeenCalled();
  });
});

describe('MediaFrameCache coverage lookup', () => {
  const withDuration = (timestamp: number, duration?: number) => {
    const f = frame(timestamp);
    f.duration = duration;
    return f;
  };

  it('getCovering returns the frame whose duration spans the time, not the nearest one', () => {
    const cache = new MediaFrameCache();
    const a = withDuration(0.0, 1 / 30);
    const b = withDuration(1 / 30, 1 / 30);
    cache.set(a.timestamp, a);
    cache.set(b.timestamp, b);
    // 0.03 is nearer to b (0.0333) than to a (0), but a is still on screen
    expect(cache.getCovering(0.03, 1 / 48)).toBe(a);
    expect(cache.getCovering(0.034, 1 / 48)).toBe(b);
  });

  it('getCovering misses past the frame duration, and never returns a future frame', () => {
    const cache = new MediaFrameCache();
    const a = withDuration(1.0, 1 / 30);
    cache.set(a.timestamp, a);
    expect(cache.getCovering(1.2, 1 / 48)).toBeUndefined();
    expect(cache.getCovering(0.9, 1 / 48)).toBeUndefined();
  });

  it('frames without a duration fall back to the tolerance window', () => {
    const cache = new MediaFrameCache();
    const a = withDuration(1.0);
    cache.set(a.timestamp, a);
    expect(cache.getCovering(1.01, 0.02)).toBe(a);
    expect(cache.getCovering(1.05, 0.02)).toBeUndefined();
  });

  it('getAtOrBefore returns the latest earlier frame regardless of age', () => {
    const cache = new MediaFrameCache();
    const a = withDuration(1.0, 0.03);
    const b = withDuration(2.0, 0.03);
    cache.set(a.timestamp, a);
    cache.set(b.timestamp, b);
    expect(cache.getAtOrBefore(1.9)).toBe(a);
    expect(cache.getAtOrBefore(5)).toBe(b);
    expect(cache.getAtOrBefore(0.5)).toBeUndefined();
  });
});

describe('timestamp quantization', () => {
  it('a request on the exact frame boundary selects the frame whose ms-rounded timestamp is slightly later', () => {
    const cache = new MediaFrameCache();
    const f1 = frame(0.033); f1.duration = 0.034;
    const f2 = frame(0.067); f2.duration = 0.033;
    cache.set(f1.timestamp, f1);
    cache.set(f2.timestamp, f2);
    // 2/30 = 0.066667 s; Matroska stored frame 2 at 0.067 s
    expect(cache.getCovering(2 / 30, 1 / 48)).toBe(f2);
    expect(cache.getAtOrBefore(2 / 30)).toBe(f2);
    expect(cache.getCovering(0.05, 1 / 48)).toBe(f1);
  });
});
