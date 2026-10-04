import type { MediaFrame, MediaSource } from './media';
import { MediaFrameCache } from './media-cache';

export interface FrameSchedulerOptions {
  cache?: MediaFrameCache;
  tolerance?: number;
}

/**
 * Coordinates timeline time with media decoding and a bounded decoded-frame
 * cache. Rendering code can request frames without knowing which media
 * backend produced them.
 */
export class MediaFrameScheduler {
  readonly cache: MediaFrameCache;
  private readonly tolerance: number;
  private requestId = 0;

  constructor(options: FrameSchedulerOptions = {}) {
    this.cache = options.cache ?? new MediaFrameCache();
    this.tolerance = Math.max(0, options.tolerance ?? 1 / 120);
  }

  async getFrame(source: MediaSource, time: number, signal?: AbortSignal): Promise<MediaFrame | null> {
    const cached = this.cache.getNearest(time, this.tolerance);
    if (cached) return cached;

    const requestId = ++this.requestId;
    const frame = await source.getFrame(time, signal);
    if (!frame) return null;

    // A newer request supersedes this decode. Do not insert stale frames.
    if (requestId !== this.requestId) {
      frame.close();
      return null;
    }

    this.cache.set(frame.timestamp, frame);
    return frame;
  }

  cancelPending(): void {
    this.requestId += 1;
  }

  clear(): void {
    this.cancelPending();
    this.cache.clear();
  }
}
