import { evaluateProperty } from '../animation';
import {
  AddKeyframeCommand,
  DeleteKeyframeCommand,
  SetPropertyValueCommand,
  type Command,
} from '../commands';
import type { Keyframe, Layer, PropertyValue } from '../model';

export type TransformPath = 'position' | 'scale' | 'rotation' | 'opacity';

const KEYFRAME_EPSILON = 0.05;

function findKeyframeAt(keyframes: Keyframe[], time: number): Keyframe | undefined {
  return keyframes.find((k) => Math.abs(k.time - time) < KEYFRAME_EPSILON);
}

/** Add a keyframe at `time` (holding the current evaluated value), or remove the one that is there. */
export function buildToggleKeyframe(layer: Layer, path: TransformPath, time: number): Command {
  const prop = layer.transform[path];
  const existing = findKeyframeAt(prop.keyframes, time);
  if (existing) return new DeleteKeyframeCommand(layer.id, path, existing.id);

  const keyframe: Keyframe<any> = {
    id: crypto.randomUUID(),
    time,
    value: evaluateProperty(prop as any, time),
    interpolation: 'bezier',
  };
  return new AddKeyframeCommand(layer.id, path, keyframe);
}

/**
 * Build the command that sets one axis (or the whole scalar) of a transform property.
 *
 * When the property is animated the edit is written as a keyframe at `time`, and the
 * untouched axes keep their *evaluated* value at that time (not the static base value).
 */
export function buildSetTransformValue(
  layer: Layer,
  path: TransformPath,
  axisIndex: number | null,
  value: number,
  time: number
): Command {
  const prop = layer.transform[path];
  const animated = prop.keyframes.length > 0;
  const base: PropertyValue = animated ? evaluateProperty(prop as any, time) : prop.value;

  let next: any;
  if (axisIndex !== null && Array.isArray(base)) {
    const copy = [...base];
    copy[axisIndex] = value;
    next = copy;
  } else {
    next = value;
  }

  if (!animated) return new SetPropertyValueCommand(layer.id, path, prop.value as any, next);

  const existing = findKeyframeAt(prop.keyframes, time);
  const keyframe: Keyframe<any> = {
    id: existing ? existing.id : crypto.randomUUID(),
    time,
    value: next,
    interpolation: existing ? existing.interpolation : 'bezier',
  };
  return new AddKeyframeCommand(layer.id, path, keyframe);
}

/** Move a layer in the viewport by (dx, dy) as a single undoable command. */
export function buildTranslate(layer: Layer, dx: number, dy: number, time: number): Command {
  const prop = layer.transform.position;
  const current = evaluateProperty(prop, time);
  const x = Math.round((Array.isArray(current) ? current[0] : 0) + dx);
  const y = Math.round((Array.isArray(current) ? current[1] : 0) + dy);
  const z = Array.isArray(current) ? current[2] ?? 0 : 0;
  const next: [number, number, number] = [x, y, z];

  if (prop.keyframes.length === 0) return new SetPropertyValueCommand(layer.id, 'position', prop.value, next);

  const existing = findKeyframeAt(prop.keyframes, time);
  return new AddKeyframeCommand(layer.id, 'position', {
    id: existing ? existing.id : crypto.randomUUID(),
    time,
    value: next,
    interpolation: existing ? existing.interpolation : 'bezier',
  });
}

/** Time of the previous/next keyframe relative to `time`, or null if none. */
export function findAdjacentKeyframeTime(
  layer: Layer,
  path: TransformPath,
  time: number,
  direction: -1 | 1
): number | null {
  const sorted = [...layer.transform[path].keyframes].sort((a, b) => a.time - b.time);
  if (direction === -1) {
    const prev = sorted.filter((k) => k.time < time - 0.01);
    return prev.length ? prev[prev.length - 1].time : null;
  }
  const next = sorted.find((k) => k.time > time + 0.01);
  return next ? next.time : null;
}
