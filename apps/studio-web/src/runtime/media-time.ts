import type { Layer } from '../model';

/**
 * Map composition time to a time inside the layer's source media.
 *
 *   mediaTime = inPoint + (compTime - layer.start)
 *
 * Clamped to [0, mediaDuration - epsilon] so the last frame is held instead of seeking past the end.
 */
export function computeMediaTime(layer: Layer, compTime: number, mediaDuration?: number): number {
  const inPoint = layer.content.mediaInPoint ?? 0;
  let t = inPoint + (compTime - layer.start);
  if (t < 0) t = 0;
  if (mediaDuration !== undefined && Number.isFinite(mediaDuration) && mediaDuration > 0) {
    const last = Math.max(0, mediaDuration - 1 / 120);
    if (t > last) t = last;
  }
  return t;
}
