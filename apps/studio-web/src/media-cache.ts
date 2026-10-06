import type { MediaFrame } from './media';

/**
 * Slack when comparing a requested time to a frame timestamp. Containers quantize timestamps
 * (Matroska uses whole milliseconds: frame 2 of a 30fps clip is stored as 0.067s, not 0.06667s),
 * so a request landing exactly on a frame boundary must still select that frame.
 * 1ms is far below one frame interval for any real frame rate (240fps = 4.2ms).
 */
export const TIME_EPSILON = 1e-3;

/** Memory a decoded frame holds. Decoded video is held as RGBA-equivalent unless the frame says otherwise. */
export function frameBytes(frame: Pick<MediaFrame, 'width' | 'height' | 'byteSize'>): number {
  return frame.byteSize ?? Math.max(1, frame.width * frame.height * 4);
}

export interface FrameCacheOptions {
  /** Upper bound on the number of frames. */
  maxFrames?: number;
  /** Upper bound on the memory held by the frames, in bytes. Unbounded when omitted. */
  maxBytes?: number;
}

/**
 * LRU cache for decoded frames with a frame-count limit and a memory budget.
 *
 * Ownership stays with the cache: evicted/replaced frames are closed so
 * VideoFrame-backed resources do not accumulate in browser memory.
 *
 * The newest frame is never evicted by the byte budget, so a single frame larger than
 * the whole budget can still be shown (the budget is a target, not a hard wall).
 */
export class MediaFrameCache {
  private readonly frames = new Map<number, MediaFrame>();
  private maxFrames: number;
  private maxBytes: number;
  private usedBytes = 0;

  constructor(options: FrameCacheOptions = {}) {
    this.maxFrames = Math.max(1, Math.floor(options.maxFrames ?? 8));
    this.maxBytes = options.maxBytes !== undefined ? Math.max(1, options.maxBytes) : Number.POSITIVE_INFINITY;
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
    if (previous) {
      this.usedBytes -= frameBytes(previous);
      if (previous !== frame) previous.close();
    }
    this.frames.delete(time);
    this.frames.set(time, frame);
    this.usedBytes += frameBytes(frame);
    this.trim();
  }

  has(time: number): boolean {
    return this.frames.has(time);
  }

  delete(time: number): boolean {
    const frame = this.frames.get(time);
    if (!frame) return false;
    this.frames.delete(time);
    this.usedBytes -= frameBytes(frame);
    frame.close();
    return true;
  }

  clear(): void {
    for (const frame of this.frames.values()) frame.close();
    this.frames.clear();
    this.usedBytes = 0;
  }

  /**
   * Change the limits (e.g. when another source claims part of a shared budget). Evicts
   * immediately if the cache no longer fits.
   */
  setLimits(limits: FrameCacheOptions): void {
    if (limits.maxFrames !== undefined) this.maxFrames = Math.max(1, Math.floor(limits.maxFrames));
    if (limits.maxBytes !== undefined) this.maxBytes = Math.max(1, limits.maxBytes);
    this.trim();
  }

  /**
   * Drop every frame that is already in the past: all frames before the one on screen at
   * `time`. Playback calls this so frames the playhead has left make room for the ones decoded
   * ahead; without it a full cache would stop decode-ahead for good.
   */
  evictBefore(time: number): number {
    let current: MediaFrame | undefined;
    for (const frame of this.frames.values()) {
      if (frame.timestamp <= time + TIME_EPSILON && (!current || frame.timestamp > current.timestamp)) current = frame;
    }
    if (!current) return 0;
    let dropped = 0;
    for (const timestamp of [...this.frames.keys()]) {
      if (timestamp < current.timestamp && this.delete(timestamp)) dropped += 1;
    }
    return dropped;
  }

  /**
   * Whether one more frame of `bytes` fits without evicting anything. Decode-ahead asks this
   * before decoding: filling the cache with future frames must never push out the frames
   * that are about to be shown.
   */
  canFit(bytes: number): boolean {
    if (this.frames.size === 0) return true;
    return this.frames.size < this.maxFrames && this.usedBytes + bytes <= this.maxBytes;
  }

  get size(): number {
    return this.frames.size;
  }

  /** Memory currently held by the cached frames. */
  get bytes(): number {
    return this.usedBytes;
  }

  get byteLimit(): number {
    return this.maxBytes;
  }

  private trim(): void {
    while (this.frames.size > this.maxFrames || (this.usedBytes > this.maxBytes && this.frames.size > 1)) {
      const oldest = this.frames.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
  }
}
