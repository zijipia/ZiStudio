import type { EditorState } from './editor';
import type { Effect, Keyframe, Layer, LayerAudio, PropertyValue } from './model';

function isTimeBasedMedia(layer: Layer): boolean {
  return layer.type === 'video' || layer.type === 'audio';
}

export interface Command {
  label: string;
  execute(state: EditorState): EditorState;
  undo(state: EditorState): EditorState;
  /**
   * Called on the newest history entry with the command that was just executed. Return a
   * command that stands for both (they become one undo step), or null to keep them separate.
   */
  coalesce?(next: Command): Command | null;
}

export class SetPropertyValueCommand<T extends PropertyValue> implements Command {
  label: string;
  private layerId: string;
  private propertyPath: 'position' | 'scale' | 'rotation' | 'opacity';
  private prevValue: T;
  private nextValue: T;

  constructor(layerId: string, propertyPath: 'position' | 'scale' | 'rotation' | 'opacity', prevValue: T, nextValue: T) {
    this.label = `Change ${propertyPath}`;
    this.layerId = layerId;
    this.propertyPath = propertyPath;
    this.prevValue = JSON.parse(JSON.stringify(prevValue));
    this.nextValue = JSON.parse(JSON.stringify(nextValue));
  }

  execute(state: EditorState): EditorState {
    return this.applyValue(state, this.nextValue);
  }

  undo(state: EditorState): EditorState {
    return this.applyValue(state, this.prevValue);
  }

  private applyValue(state: EditorState, val: T): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map(layer => {
      if (layer.id !== this.layerId) return layer;
      const transform = { ...layer.transform };
      const prop = { ...transform[this.propertyPath], value: JSON.parse(JSON.stringify(val)) };
      (transform as any)[this.propertyPath] = prop;
      return { ...layer, transform };
    });

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }
}

export class AddKeyframeCommand<T extends PropertyValue> implements Command {
  label: string;
  private layerId: string;
  private propertyPath: 'position' | 'scale' | 'rotation' | 'opacity';
  private keyframe: Keyframe<T>;
  private existingKeyframe: Keyframe<T> | null = null;

  constructor(layerId: string, propertyPath: 'position' | 'scale' | 'rotation' | 'opacity', keyframe: Keyframe<T>) {
    this.label = `Add Keyframe on ${propertyPath}`;
    this.layerId = layerId;
    this.propertyPath = propertyPath;
    this.keyframe = keyframe;
  }

  execute(state: EditorState): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map(layer => {
      if (layer.id !== this.layerId) return layer;
      const transform = { ...layer.transform };
      const prop = (transform as any)[this.propertyPath];
      const existing = (prop.keyframes as Keyframe<any>[]).find(k => Math.abs(k.time - this.keyframe.time) < 0.001);
      this.existingKeyframe = existing ? { ...existing } : null;

      const filtered = (prop.keyframes as Keyframe<any>[]).filter(k => Math.abs(k.time - this.keyframe.time) >= 0.001);
      const nextKeyframes = [...filtered, this.keyframe].sort((a, b) => a.time - b.time);

      (transform as any)[this.propertyPath] = { ...prop, keyframes: nextKeyframes };
      return { ...layer, transform };
    });

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }

  undo(state: EditorState): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map(layer => {
      if (layer.id !== this.layerId) return layer;
      const transform = { ...layer.transform };
      const prop = (transform as any)[this.propertyPath];
      let nextKeyframes = (prop.keyframes as Keyframe<any>[]).filter(k => k.id !== this.keyframe.id && Math.abs(k.time - this.keyframe.time) >= 0.001);

      if (this.existingKeyframe) {
        nextKeyframes = [...nextKeyframes, this.existingKeyframe].sort((a, b) => a.time - b.time);
      }

      (transform as any)[this.propertyPath] = { ...prop, keyframes: nextKeyframes };
      return { ...layer, transform };
    });

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }
}

export class DeleteKeyframeCommand implements Command {
  label = 'Delete Keyframe';
  private layerId: string;
  private propertyPath: 'position' | 'scale' | 'rotation' | 'opacity';
  private deletedKeyframe: Keyframe<any> | null = null;
  private keyframeId: string;

  constructor(layerId: string, propertyPath: 'position' | 'scale' | 'rotation' | 'opacity', keyframeId: string) {
    this.layerId = layerId;
    this.propertyPath = propertyPath;
    this.keyframeId = keyframeId;
  }

  execute(state: EditorState): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map(layer => {
      if (layer.id !== this.layerId) return layer;
      const transform = { ...layer.transform };
      const prop = transform[this.propertyPath];
      const target = prop.keyframes.find(k => k.id === this.keyframeId);
      if (target) {
        this.deletedKeyframe = target;
      }
      const nextKeyframes = prop.keyframes.filter(k => k.id !== this.keyframeId);
      (transform as any)[this.propertyPath] = { ...prop, keyframes: nextKeyframes };
      return { ...layer, transform };
    });

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }

  undo(state: EditorState): EditorState {
    if (!this.deletedKeyframe) return state;
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map(layer => {
      if (layer.id !== this.layerId) return layer;
      const transform = { ...layer.transform };
      const prop = transform[this.propertyPath];
      const nextKeyframes = [...prop.keyframes, this.deletedKeyframe!].sort((a, b) => a.time - b.time);
      (transform as any)[this.propertyPath] = { ...prop, keyframes: nextKeyframes };
      return { ...layer, transform };
    });

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }
}

export class AddLayerCommand implements Command {
  label: string;
  private layer: Layer;
  private insertIndex: number;

  constructor(layer: Layer, insertIndex = 0) {
    this.label = `Add Layer: ${layer.name}`;
    this.layer = layer;
    this.insertIndex = insertIndex;
  }

  execute(state: EditorState): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const nextLayers = [...comp.layers];
    nextLayers.splice(this.insertIndex, 0, this.layer);

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers: nextLayers } : c
    );

    return {
      ...state,
      project: { ...state.project, compositions },
      selectedLayerId: this.layer.id,
    };
  }

  undo(state: EditorState): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const nextLayers = comp.layers.filter(l => l.id !== this.layer.id);
    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers: nextLayers } : c
    );

    return {
      ...state,
      project: { ...state.project, compositions },
      selectedLayerId: state.selectedLayerId === this.layer.id ? null : state.selectedLayerId,
    };
  }
}

export class DeleteLayerCommand implements Command {
  label: string;
  private deletedLayer: Layer | null = null;
  private index = -1;
  private layerId: string;

  constructor(layerId: string) {
    this.label = 'Delete Layer';
    this.layerId = layerId;
  }

  execute(state: EditorState): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const idx = comp.layers.findIndex(l => l.id === this.layerId);
    if (idx === -1) return state;

    this.deletedLayer = comp.layers[idx];
    this.index = idx;

    const nextLayers = comp.layers.filter(l => l.id !== this.layerId);
    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers: nextLayers } : c
    );

    return {
      ...state,
      project: { ...state.project, compositions },
      selectedLayerId: state.selectedLayerId === this.layerId ? null : state.selectedLayerId,
    };
  }

  undo(state: EditorState): EditorState {
    if (!this.deletedLayer || this.index === -1) return state;
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const nextLayers = [...comp.layers];
    nextLayers.splice(this.index, 0, this.deletedLayer);

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers: nextLayers } : c
    );

    return {
      ...state,
      project: { ...state.project, compositions },
      selectedLayerId: this.deletedLayer.id,
    };
  }
}

export class SplitLayerCommand implements Command {
  label = 'Split Layer';
  private originalLayerId: string;
  private splitTime: number;
  private createdLayerId: string;
  private prevDuration: number = 0;

  constructor(layerId: string, splitTime: number) {
    this.originalLayerId = layerId;
    this.splitTime = splitTime;
    this.createdLayerId = crypto.randomUUID();
  }

  execute(state: EditorState): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const idx = comp.layers.findIndex(l => l.id === this.originalLayerId);
    if (idx === -1) return state;

    const original = comp.layers[idx];
    if (this.splitTime <= original.start || this.splitTime >= original.start + original.duration) {
      return state;
    }

    this.prevDuration = original.duration;
    const firstDuration = this.splitTime - original.start;
    const secondDuration = original.duration - firstDuration;

    const updatedOriginal: Layer = {
      ...original,
      duration: firstDuration,
    };

    const newLayer: Layer = {
      ...JSON.parse(JSON.stringify(original)),
      id: this.createdLayerId,
      name: `${original.name} (Split)`,
      start: this.splitTime,
      duration: secondDuration,
    };
    if (isTimeBasedMedia(original)) {
      newLayer.content = {
        ...newLayer.content,
        mediaInPoint: (original.content.mediaInPoint ?? 0) + firstDuration,
      };
    }

    const nextLayers = [...comp.layers];
    nextLayers[idx] = updatedOriginal;
    nextLayers.splice(idx, 0, newLayer);

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers: nextLayers } : c
    );

    return {
      ...state,
      project: { ...state.project, compositions },
      selectedLayerId: this.createdLayerId,
    };
  }

  undo(state: EditorState): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const idx = comp.layers.findIndex(l => l.id === this.originalLayerId);
    if (idx === -1) return state;

    const original = comp.layers[idx];
    const restoredOriginal: Layer = {
      ...original,
      duration: this.prevDuration,
    };

    const nextLayers = comp.layers
      .filter(l => l.id !== this.createdLayerId)
      .map(l => (l.id === this.originalLayerId ? restoredOriginal : l));

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers: nextLayers } : c
    );

    return {
      ...state,
      project: { ...state.project, compositions },
      selectedLayerId: this.originalLayerId,
    };
  }
}

export class MoveLayerTimingCommand implements Command {
  label = 'Move Layer';
  private layerId: string;
  private prevStart: number;
  private prevDuration: number;
  private nextStart: number;
  private nextDuration: number;
  private prevInPoint: number | undefined;
  private nextInPoint: number | undefined;
  private inPointResolved = false;

  constructor(layerId: string, prevStart: number, prevDuration: number, nextStart: number, nextDuration: number) {
    this.layerId = layerId;
    this.prevStart = prevStart;
    this.prevDuration = prevDuration;
    this.nextStart = nextStart;
    this.nextDuration = nextDuration;
  }

  execute(state: EditorState): EditorState {
    return this.applyTiming(state, this.nextStart, this.nextDuration, true);
  }

  undo(state: EditorState): EditorState {
    return this.applyTiming(state, this.prevStart, this.prevDuration, false);
  }

  /** A left trim keeps the clip's end fixed while the start moves; the media must not slide. */
  private isLeftTrim(): boolean {
    const prevEnd = this.prevStart + this.prevDuration;
    const nextEnd = this.nextStart + Math.max(0.1, this.nextDuration);
    return Math.abs(prevEnd - nextEnd) < 1e-6 && Math.abs(this.nextStart - this.prevStart) > 1e-9;
  }

  private applyTiming(state: EditorState, start: number, duration: number, forward: boolean): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map(l => {
      if (l.id !== this.layerId) return l;
      if (!this.inPointResolved) {
        this.prevInPoint = l.content.mediaInPoint;
        this.nextInPoint =
          isTimeBasedMedia(l) && this.isLeftTrim()
            ? Math.max(0, (l.content.mediaInPoint ?? 0) + (this.nextStart - this.prevStart))
            : l.content.mediaInPoint;
        this.inPointResolved = true;
      }
      const inPoint = forward ? this.nextInPoint : this.prevInPoint;
      const content = inPoint === l.content.mediaInPoint ? l.content : { ...l.content, mediaInPoint: inPoint };
      return { ...l, start, duration: Math.max(0.1, duration), content };
    });

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }
}

export class AddEffectCommand implements Command {
  label = 'Add Effect';
  private layerId: string;
  private effect: Effect;

  constructor(layerId: string, effect: Effect) {
    this.layerId = layerId;
    this.effect = effect;
  }

  execute(state: EditorState): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map(l =>
      l.id === this.layerId ? { ...l, effects: [...l.effects, this.effect] } : l
    );

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }

  undo(state: EditorState): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map(l =>
      l.id === this.layerId ? { ...l, effects: l.effects.filter(e => e.id !== this.effect.id) } : l
    );

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }
}

export class DeleteEffectCommand implements Command {
  label = 'Delete Effect';
  private layerId: string;
  private effectId: string;
  private deletedEffect: Effect | null = null;
  private index = -1;

  constructor(layerId: string, effectId: string) {
    this.layerId = layerId;
    this.effectId = effectId;
  }

  execute(state: EditorState): EditorState {
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map(l => {
      if (l.id !== this.layerId) return l;
      const idx = l.effects.findIndex(e => e.id === this.effectId);
      if (idx !== -1) {
        this.deletedEffect = l.effects[idx];
        this.index = idx;
      }
      return { ...l, effects: l.effects.filter(e => e.id !== this.effectId) };
    });

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }

  undo(state: EditorState): EditorState {
    if (!this.deletedEffect || this.index === -1) return state;
    const comp = state.project.compositions.find(c => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map(l => {
      if (l.id !== this.layerId) return l;
      const nextEffects = [...l.effects];
      nextEffects.splice(this.index, 0, this.deletedEffect!);
      return { ...l, effects: nextEffects };
    });

    const compositions = state.project.compositions.map(c =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }
}

export class ReorderLayerCommand implements Command {
  label = 'Reorder Layer';
  private fromIndex: number;
  private toIndex: number;

  constructor(fromIndex: number, toIndex: number) {
    this.fromIndex = fromIndex;
    this.toIndex = toIndex;
  }

  execute(state: EditorState): EditorState {
    return this.reorder(state, this.fromIndex, this.toIndex);
  }

  undo(state: EditorState): EditorState {
    return this.reorder(state, this.toIndex, this.fromIndex);
  }

  private reorder(state: EditorState, from: number, to: number): EditorState {
    const comp = state.project.compositions.find((c) => c.id === state.activeCompositionId);
    if (!comp) return state;
    if (from < 0 || from >= comp.layers.length || to < 0 || to >= comp.layers.length) return state;

    const layers = [...comp.layers];
    const [moved] = layers.splice(from, 1);
    layers.splice(to, 0, moved);

    const compositions = state.project.compositions.map((c) =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }
}

export class UpdateLayerPropertiesCommand implements Command {
  label = 'Update Layer';
  private layerId: string;
  private prevUpdates: Partial<Layer>;
  private nextUpdates: Partial<Layer>;

  constructor(layerId: string, prevUpdates: Partial<Layer>, nextUpdates: Partial<Layer>) {
    this.layerId = layerId;
    this.prevUpdates = JSON.parse(JSON.stringify(prevUpdates));
    this.nextUpdates = JSON.parse(JSON.stringify(nextUpdates));
  }

  execute(state: EditorState): EditorState {
    return this.apply(state, this.nextUpdates);
  }

  undo(state: EditorState): EditorState {
    return this.apply(state, this.prevUpdates);
  }

  private apply(state: EditorState, updates: Partial<Layer>): EditorState {
    const comp = state.project.compositions.find((c) => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map((l) => (l.id === this.layerId ? { ...l, ...updates } : l));
    const compositions = state.project.compositions.map((c) =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }
}

/** Change a layer's mix settings (volume, mute). Edits in quick succession on one layer are one undo step. */
export class SetLayerAudioCommand implements Command {
  label = 'Change Layer Audio';
  static readonly COALESCE_MS = 800;

  constructor(
    private readonly layerId: string,
    private readonly prev: LayerAudio | undefined,
    private readonly next: LayerAudio,
    private readonly at: number = Date.now()
  ) {}

  execute(state: EditorState): EditorState {
    return this.apply(state, this.next);
  }

  undo(state: EditorState): EditorState {
    return this.apply(state, this.prev);
  }

  coalesce(next: Command): Command | null {
    if (!(next instanceof SetLayerAudioCommand)) return null;
    if (next.layerId !== this.layerId || next.at - this.at > SetLayerAudioCommand.COALESCE_MS) return null;
    return new SetLayerAudioCommand(this.layerId, this.prev, next.next, next.at);
  }

  private apply(state: EditorState, audio: LayerAudio | undefined): EditorState {
    const comp = state.project.compositions.find((c) => c.id === state.activeCompositionId);
    if (!comp) return state;
    const layers = comp.layers.map((l) => (l.id === this.layerId ? { ...l, audio } : l));
    const compositions = state.project.compositions.map((c) => (c.id === comp.id ? { ...c, layers } : c));
    return { ...state, project: { ...state.project, compositions } };
  }
}

export class UpdateKeyframeInterpolationCommand implements Command {
  label = 'Change Interpolation';
  private layerId: string;
  private propertyPath: 'position' | 'scale' | 'rotation' | 'opacity';
  private keyframeId: string;
  private prevInterp: Keyframe['interpolation'];
  private nextInterp: Keyframe['interpolation'];

  constructor(
    layerId: string,
    propertyPath: 'position' | 'scale' | 'rotation' | 'opacity',
    keyframeId: string,
    prevInterp: Keyframe['interpolation'],
    nextInterp: Keyframe['interpolation']
  ) {
    this.layerId = layerId;
    this.propertyPath = propertyPath;
    this.keyframeId = keyframeId;
    this.prevInterp = prevInterp;
    this.nextInterp = nextInterp;
  }

  execute(state: EditorState): EditorState {
    return this.setInterp(state, this.nextInterp);
  }

  undo(state: EditorState): EditorState {
    return this.setInterp(state, this.prevInterp);
  }

  private setInterp(state: EditorState, interp: Keyframe['interpolation']): EditorState {
    const comp = state.project.compositions.find((c) => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map((l) => {
      if (l.id !== this.layerId) return l;
      const transform = { ...l.transform };
      const prop = (transform as any)[this.propertyPath];
      const keyframes = prop.keyframes.map((k: Keyframe) =>
        k.id === this.keyframeId ? { ...k, interpolation: interp } : k
      );
      (transform as any)[this.propertyPath] = { ...prop, keyframes };
      return { ...l, transform };
    });

    const compositions = state.project.compositions.map((c) =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }
}

export class MoveKeyframeCommand implements Command {
  label = 'Move Keyframe';
  private layerId: string;
  private propertyPath: 'position' | 'scale' | 'rotation' | 'opacity';
  private keyframeId: string;
  private prevTime: number;
  private nextTime: number;

  constructor(
    layerId: string,
    propertyPath: 'position' | 'scale' | 'rotation' | 'opacity',
    keyframeId: string,
    prevTime: number,
    nextTime: number
  ) {
    this.layerId = layerId;
    this.propertyPath = propertyPath;
    this.keyframeId = keyframeId;
    this.prevTime = prevTime;
    this.nextTime = nextTime;
  }

  execute(state: EditorState): EditorState {
    return this.setTime(state, this.nextTime);
  }

  undo(state: EditorState): EditorState {
    return this.setTime(state, this.prevTime);
  }

  private setTime(state: EditorState, time: number): EditorState {
    const comp = state.project.compositions.find((c) => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map((l) => {
      if (l.id !== this.layerId) return l;
      const transform = { ...l.transform };
      const prop = (transform as any)[this.propertyPath];
      const keyframes = prop.keyframes
        .map((k: Keyframe) => (k.id === this.keyframeId ? { ...k, time } : k))
        .sort((a: Keyframe, b: Keyframe) => a.time - b.time);
      (transform as any)[this.propertyPath] = { ...prop, keyframes };
      return { ...l, transform };
    });

    const compositions = state.project.compositions.map((c) =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }
}

export class UpdateEffectPropertyCommand implements Command {
  label = 'Update Effect';
  private layerId: string;
  private effectId: string;
  private propKey: string;
  private prevVal: any;
  private nextVal: any;

  constructor(layerId: string, effectId: string, propKey: string, prevVal: any, nextVal: any) {
    this.layerId = layerId;
    this.effectId = effectId;
    this.propKey = propKey;
    this.prevVal = prevVal;
    this.nextVal = nextVal;
  }

  execute(state: EditorState): EditorState {
    return this.applyVal(state, this.nextVal);
  }

  undo(state: EditorState): EditorState {
    return this.applyVal(state, this.prevVal);
  }

  private applyVal(state: EditorState, val: any): EditorState {
    const comp = state.project.compositions.find((c) => c.id === state.activeCompositionId);
    if (!comp) return state;

    const layers = comp.layers.map((l) => {
      if (l.id !== this.layerId) return l;
      const effects = l.effects.map((ef) => {
        if (ef.id !== this.effectId) return ef;
        const prop = ef.properties[this.propKey];
        if (!prop) return ef;
        return {
          ...ef,
          properties: {
            ...ef.properties,
            [this.propKey]: { ...prop, value: val },
          },
        };
      });
      return { ...l, effects };
    });

    const compositions = state.project.compositions.map((c) =>
      c.id === comp.id ? { ...c, layers } : c
    );

    return { ...state, project: { ...state.project, compositions } };
  }
}

