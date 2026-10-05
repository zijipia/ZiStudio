import type { MediaFrame } from './media';

/**
 * Slack when comparing a requested time to a frame timestamp. Containers quantize timestamps
 * (Matroska uses whole milliseconds: frame 2 of a 30fps clip is stored as 0.067s, not 0.06667s),
 * so a request landing exactly on a frame boundary must still select that frame.
 * 1ms is far below one frame interval for any real frame rate (240fps = 4.2ms).
 */
export const TIME_EPSILON = 1e-3;

export interface FrameCacheOptions {
  maxFrames?: number;
}

/**
 * Small LRU cache for decoded frames.
 *
 * Ownership stays with the cache: evicted/replaced frames are closed so
 * VideoFrame-backed resources do not accumulate in browser memory.
 */
export class MediaFrameCache {
  private readonly frames = new Map<number, MediaFrame>();
  private readonly maxFrames: number;

  constructor(options: FrameCacheOptions = {}) {
    this.maxFrames = Math.max(1, Math.floor(options.maxFrames ?? 8));
  }

  get(time: number): MediaFrame | undefined {
    const frame = this.frames.get(time);
    if (!frame) return undefined;
    this.frames.delete(time);
    this.frames.set(time, frame);
    return frame;
  }

  getNearest(time: number, tolerance: number): MediaFrame | undefined {
    let nearest: MediaFrame | undefined;
    let distance = Number.POSITIVE_INFINITY;

    for (const frame of this.frames.values()) {
      const candidateDistance = Math.abs(frame.timestamp - time);
      if (candidateDistance <= tolerance && candidateDistance < distance) {
        nearest = frame;
        distance = candidateDistance;
      }
    }

    if (!nearest) return undefined;
    this.frames.delete(nearest.timestamp);
    this.frames.set(nearest.timestamp, nearest);
    return nearest;
  }

  /**
   * The frame that is *on screen* at `time`: the latest frame starting at or before `time`
   * whose duration still covers it. Frames without a duration are accepted within
   * `fallbackTolerance` of their timestamp.
   */
  getCovering(time: number, fallbackTolerance: number): MediaFrame | undefined {
    let best: MediaFrame | undefined;
    for (const frame of this.frames.values()) {
      if (frame.timestamp > time + TIME_EPSILON) continue;
      const covers =
        frame.duration && frame.duration > 0
          ? time < frame.timestamp + frame.duration - TIME_EPSILON
          : time - frame.timestamp <= fallbackTolerance;
      if (covers && (!best || frame.timestamp > best.timestamp)) best = frame;
    }
    if (best) this.touch(best);
    return best;
  }

  /** Latest frame starting at or before `time`, however old. */
  getAtOrBefore(time: number): MediaFrame | undefined {
    let best: MediaFrame | undefined;
    for (const frame of this.frames.values()) {
      if (frame.timestamp <= time + TIME_EPSILON && (!best || frame.timestamp > best.timestamp)) best = frame;
    }
    if (best) this.touch(best);
    return best;
  }

  private touch(frame: MediaFrame): void {
    this.frames.delete(frame.timestamp);
    this.frames.set(frame.timestamp, frame);
  }

  set(time: number, frame: MediaFrame): void {
    const previous = this.frames.get(time);
    if (previous && previous !== frame) previous.close();
    this.frames.delete(time);
    this.frames.set(time, frame);
    this.trim();
  }

  has(time: number): boolean {
    return this.frames.has(time);
  }

  delete(time: number): boolean {
    const frame = this.frames.get(time);
    if (!frame) return false;
    this.frames.delete(time);
    frame.close();
    return true;
  }

  clear(): void {
    for (const frame of this.frames.values()) frame.close();
    this.frames.clear();
  }

  get size(): number {
    return this.frames.size;
  }

  private trim(): void {
    while (this.frames.size > this.maxFrames) {
      const oldest = this.frames.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
  }
}
