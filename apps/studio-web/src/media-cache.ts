import type { MediaFrame } from './media';

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
