import type { MediaFrame } from '../media';
import type { Layer } from '../model';

export type MediaStatus = 'none' | 'loading' | 'ready' | 'error';

export interface ResolvedFrame {
  /** Frame to draw right now (may be slightly stale while a newer one is decoding). */
  frame: MediaFrame | null;
  status: MediaStatus;
}

/**
 * What the renderer needs from the media layer. It is synchronous on purpose:
 * canvas drawing cannot await, so the provider returns the best frame it has
 * and notifies subscribers when a better one becomes available.
 */
export interface FrameProvider {
  resolve(layer: Layer, compTime: number): ResolvedFrame;
  getDimensions(layer: Layer): { width: number; height: number } | null;
  subscribe(listener: () => void): () => void;
}
