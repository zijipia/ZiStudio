import { UpdateKeyframeInterpolationCommand, DeleteKeyframeCommand } from '../commands';
import type { Keyframe, Layer } from '../model';
import {
  buildSetTransformValue,
  buildToggleKeyframe,
  buildTranslate,
  findAdjacentKeyframeTime,
  type TransformPath,
} from './animation-ops';
import type { EditorRuntime } from './editor-runtime';

const TRANSFORM_PATHS: TransformPath[] = ['position', 'scale', 'rotation', 'opacity'];

/** Which transform property owns a keyframe (falls back to position). */
export function findKeyframePath(layer: Layer, keyframeId: string): TransformPath {
  return TRANSFORM_PATHS.find((p) => layer.transform[p].keyframes.some((k) => k.id === keyframeId)) ?? 'position';
}

/**
 * UI-facing animation API. The editor says *what* it wants
 * ("toggle a keyframe on position"); this controller knows how.
 */
export class AnimationController {
  constructor(private readonly runtime: EditorRuntime) {}

  private get time(): number {
    return this.runtime.getState().currentTime;
  }

  toggleKeyframe(path: TransformPath = 'position'): void {
    const layer = this.runtime.selection.getSelectedLayer();
    if (!layer) return;
    this.runtime.execute(buildToggleKeyframe(layer, path, this.time));
  }

  navigateKeyframe(path: TransformPath, direction: -1 | 1): void {
    const layer = this.runtime.selection.getSelectedLayer();
    if (!layer) return;
    const target = findAdjacentKeyframeTime(layer, path, this.time, direction);
    if (target !== null) this.runtime.playback.seek(target);
  }

  setTransformValue(path: TransformPath, axisIndex: number | null, value: number): void {
    const layer = this.runtime.selection.getSelectedLayer();
    if (!layer) return;
    this.runtime.execute(buildSetTransformValue(layer, path, axisIndex, value, this.time));
  }

  translateSelected(dx: number, dy: number): void {
    const layer = this.runtime.selection.getSelectedLayer();
    if (!layer) return;
    this.runtime.execute(buildTranslate(layer, dx, dy, this.time));
  }

  setInterpolation(layer: Layer, keyframe: Keyframe, interpolation: Keyframe['interpolation']): void {
    const path = findKeyframePath(layer, keyframe.id);
    this.runtime.execute(
      new UpdateKeyframeInterpolationCommand(layer.id, path, keyframe.id, keyframe.interpolation, interpolation)
    );
  }

  deleteKeyframe(layer: Layer, keyframe: Keyframe): void {
    this.runtime.execute(new DeleteKeyframeCommand(layer.id, findKeyframePath(layer, keyframe.id), keyframe.id));
  }
}
