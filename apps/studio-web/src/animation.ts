import type { Keyframe, Property, PropertyValue, Transform } from './model';

function cubicBezierEasing(t: number, p1x = 0.42, p1y = 0.0, p2x = 0.58, p2y = 1.0): number {
  // Approximate standard cubic bezier curve for easing
  // If standard ease-in: (0.42, 0, 1, 1)
  // If standard ease-out: (0, 0, 0.58, 1)
  // If standard ease-in-out: (0.42, 0, 0.58, 1)
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  // y(t) with y0=0, y3=1
  return 3 * uu * t * p1y + 3 * u * tt * p2y + ttt;
}

function interpolateFactor(ratio: number, interpolation: Keyframe['interpolation']): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  switch (interpolation) {
    case 'hold':
      return 0;
    case 'ease-in':
      return cubicBezierEasing(clamped, 0.42, 0.0, 1.0, 1.0);
    case 'ease-out':
      return cubicBezierEasing(clamped, 0.0, 0.0, 0.58, 1.0);
    case 'ease-in-out':
      return cubicBezierEasing(clamped, 0.42, 0.0, 0.58, 1.0);
    case 'bezier':
      return cubicBezierEasing(clamped, 0.25, 0.1, 0.25, 1.0);
    case 'linear':
    default:
      return clamped;
  }
}

export function evaluateProperty<T extends PropertyValue>(property: Property<T>, time: number): T {
  const keyframes = property.keyframes;
  if (!keyframes || keyframes.length === 0) {
    return property.value;
  }

  // Sorted keyframes
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  if (time <= sorted[0].time) {
    return sorted[0].value as T;
  }
  if (time >= sorted[sorted.length - 1].time) {
    return sorted[sorted.length - 1].value as T;
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index];
    const right = sorted[index + 1];

    if (time >= left.time && time <= right.time) {
      if (left.interpolation === 'hold') {
        return left.value as T;
      }

      const duration = right.time - left.time;
      const progress = duration === 0 ? 0 : (time - left.time) / duration;
      const factor = interpolateFactor(progress, left.interpolation);

      // Handle numbers
      if (typeof left.value === 'number' && typeof right.value === 'number') {
        return (left.value + (right.value - left.value) * factor) as T;
      }

      // Handle 2D vectors
      if (Array.isArray(left.value) && Array.isArray(right.value)) {
        const result: number[] = [];
        for (let i = 0; i < left.value.length; i++) {
          const l = Number(left.value[i]) || 0;
          const r = Number(right.value[i]) || 0;
          result.push(l + (r - l) * factor);
        }
        return result as T;
      }

      return left.value as T;
    }
  }

  return property.value;
}

export interface EvaluatedTransform {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  opacity: number;
}

export function evaluateTransform(transform: Transform, time: number): EvaluatedTransform {
  const pos = evaluateProperty(transform.position, time);
  const sca = evaluateProperty(transform.scale, time);
  const rot = evaluateProperty(transform.rotation, time);
  const op = evaluateProperty(transform.opacity, time);

  return {
    position: Array.isArray(pos) ? [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0] : [0, 0, 0],
    scale: Array.isArray(sca) ? [sca[0] ?? 100, sca[1] ?? 100, sca[2] ?? 100] : [100, 100, 100],
    rotation: Array.isArray(rot) ? [rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0] : [0, 0, 0],
    opacity: Math.max(0, Math.min(100, typeof op === 'number' ? op : 100)),
  };
}
