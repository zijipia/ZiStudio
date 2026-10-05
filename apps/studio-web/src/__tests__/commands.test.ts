import { describe, expect, it } from 'vitest';
import {
  AddKeyframeCommand,
  AddLayerCommand,
  DeleteKeyframeCommand,
  DeleteLayerCommand,
  MoveLayerTimingCommand,
  ReorderLayerCommand,
  SetPropertyValueCommand,
  SplitLayerCommand,
} from '../commands';
import { CommandManager } from '../editor';
import { createSolidLayer, type Keyframe } from '../model';
import { activeLayers, makeState } from './helpers';

describe('layer commands', () => {
  it('AddLayerCommand inserts, selects, and undoes', () => {
    const { state } = makeState(1);
    const layer = createSolidLayer('New', '#fff');
    const cmd = new AddLayerCommand(layer, 0);
    const added = cmd.execute(state);
    expect(activeLayers(added)[0].id).toBe(layer.id);
    expect(added.selectedLayerId).toBe(layer.id);
    const undone = cmd.undo(added);
    expect(activeLayers(undone)).toHaveLength(1);
    expect(undone.selectedLayerId).toBeNull();
  });

  it('DeleteLayerCommand removes and restores at the same index', () => {
    const { state, layers } = makeState(3);
    const cmd = new DeleteLayerCommand(layers[1].id);
    const deleted = cmd.execute(state);
    expect(activeLayers(deleted).map((l) => l.id)).toEqual([layers[0].id, layers[2].id]);
    const restored = cmd.undo(deleted);
    expect(activeLayers(restored).map((l) => l.id)).toEqual(layers.map((l) => l.id));
  });

  it('ReorderLayerCommand moves and undoes', () => {
    const { state, layers } = makeState(3);
    const cmd = new ReorderLayerCommand(0, 2);
    const moved = cmd.execute(state);
    expect(activeLayers(moved).map((l) => l.id)).toEqual([layers[1].id, layers[2].id, layers[0].id]);
    expect(activeLayers(cmd.undo(moved)).map((l) => l.id)).toEqual(layers.map((l) => l.id));
  });

  it('SplitLayerCommand splits timing and undo restores duration', () => {
    const { state, layers } = makeState(1);
    const cmd = new SplitLayerCommand(layers[0].id, 1.5);
    const split = cmd.execute(state);
    const result = activeLayers(split);
    expect(result).toHaveLength(2);
    const first = result.find((l) => l.id === layers[0].id)!;
    const second = result.find((l) => l.id !== layers[0].id)!;
    expect(first.duration).toBeCloseTo(1.5);
    expect(second.start).toBeCloseTo(1.5);
    expect(second.duration).toBeCloseTo(2.5);

    const undone = cmd.undo(split);
    expect(activeLayers(undone)).toHaveLength(1);
    expect(activeLayers(undone)[0].duration).toBeCloseTo(4);
  });

  it('SplitLayerCommand is a no-op outside the layer range', () => {
    const { state, layers } = makeState(1);
    const out = new SplitLayerCommand(layers[0].id, 99).execute(state);
    expect(out).toBe(state);
  });
});

describe('property / keyframe commands', () => {
  const kf = (time: number, value: [number, number, number]): Keyframe<[number, number, number]> => ({
    id: crypto.randomUUID(),
    time,
    value,
    interpolation: 'linear',
  });

  it('SetPropertyValueCommand sets and restores a value', () => {
    const { state, layers } = makeState(1);
    const cmd = new SetPropertyValueCommand(layers[0].id, 'position', [0, 0, 0], [10, 20, 0]);
    const next = cmd.execute(state);
    expect(activeLayers(next)[0].transform.position.value).toEqual([10, 20, 0]);
    expect(activeLayers(cmd.undo(next))[0].transform.position.value).toEqual([0, 0, 0]);
  });

  it('AddKeyframeCommand keeps keyframes sorted and undo removes it', () => {
    const { state, layers } = makeState(1);
    let s = new AddKeyframeCommand(layers[0].id, 'position', kf(2, [2, 0, 0])).execute(state);
    const cmd = new AddKeyframeCommand(layers[0].id, 'position', kf(1, [1, 0, 0]));
    s = cmd.execute(s);
    const times = activeLayers(s)[0].transform.position.keyframes.map((k) => k.time);
    expect(times).toEqual([1, 2]);
    const undone = cmd.undo(s);
    expect(activeLayers(undone)[0].transform.position.keyframes.map((k) => k.time)).toEqual([2]);
  });

  it('AddKeyframeCommand at the same time replaces, and undo restores the old one', () => {
    const { state, layers } = makeState(1);
    const first = kf(1, [1, 0, 0]);
    const s1 = new AddKeyframeCommand(layers[0].id, 'position', first).execute(state);
    const cmd = new AddKeyframeCommand(layers[0].id, 'position', kf(1, [9, 9, 9]));
    const s2 = cmd.execute(s1);
    expect(activeLayers(s2)[0].transform.position.keyframes).toHaveLength(1);
    expect(activeLayers(s2)[0].transform.position.keyframes[0].value).toEqual([9, 9, 9]);
    const s3 = cmd.undo(s2);
    expect(activeLayers(s3)[0].transform.position.keyframes[0].value).toEqual([1, 0, 0]);
  });

  it('DeleteKeyframeCommand deletes and restores', () => {
    const { state, layers } = makeState(1);
    const k = kf(1, [1, 0, 0]);
    const s1 = new AddKeyframeCommand(layers[0].id, 'position', k).execute(state);
    const cmd = new DeleteKeyframeCommand(layers[0].id, 'position', k.id);
    const s2 = cmd.execute(s1);
    expect(activeLayers(s2)[0].transform.position.keyframes).toHaveLength(0);
    expect(activeLayers(cmd.undo(s2))[0].transform.position.keyframes).toHaveLength(1);
  });
});

describe('CommandManager', () => {
  it('tracks undo/redo and clears redo on new command', () => {
    const { state, layers } = makeState(1);
    const mgr = new CommandManager();
    let s = mgr.execute(new SetPropertyValueCommand(layers[0].id, 'opacity', 100, 50), state);
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);
    s = mgr.undo(s);
    expect(activeLayers(s)[0].transform.opacity.value).toBe(100);
    expect(mgr.canRedo()).toBe(true);
    s = mgr.redo(s);
    expect(activeLayers(s)[0].transform.opacity.value).toBe(50);
    s = mgr.undo(s);
    s = mgr.execute(new SetPropertyValueCommand(layers[0].id, 'opacity', 100, 70), s);
    expect(mgr.canRedo()).toBe(false);
    expect(mgr.getUndoLabel()).toBe('Change opacity');
  });

  it('caps history at 50 entries', () => {
    const { state, layers } = makeState(1);
    const mgr = new CommandManager();
    let s = state;
    for (let i = 0; i < 60; i += 1) {
      s = mgr.execute(new SetPropertyValueCommand(layers[0].id, 'opacity', i, i + 1), s);
    }
    let undos = 0;
    while (mgr.canUndo()) {
      s = mgr.undo(s);
      undos += 1;
    }
    expect(undos).toBe(50);
  });
});

describe('media in-point handling', () => {
  const videoState = () => {
    const { state, layers } = makeState(1);
    const layer = layers[0];
    layer.type = 'video';
    layer.start = 2;
    layer.duration = 6;
    layer.content = { mediaUrl: 'x.mp4', mediaInPoint: 1 };
    return { state, layer };
  };

  it('split sets the second half in-point to the elapsed source time', () => {
    const { state, layer } = videoState();
    const split = new SplitLayerCommand(layer.id, 5).execute(state);
    const second = activeLayers(split).find((l) => l.id !== layer.id)!;
    // first half plays 3s of source starting at 1s -> second half starts at 4s
    expect(second.content.mediaInPoint).toBeCloseTo(4);
  });

  it('left trim advances the in-point, undo restores it', () => {
    const { state, layer } = videoState();
    // trim left edge from t=2 to t=3, end stays at t=8
    const cmd = new MoveLayerTimingCommand(layer.id, 2, 6, 3, 5);
    const trimmed = cmd.execute(state);
    expect(activeLayers(trimmed)[0].content.mediaInPoint).toBeCloseTo(2);
    const undone = cmd.undo(trimmed);
    expect(activeLayers(undone)[0].content.mediaInPoint).toBeCloseTo(1);
    expect(activeLayers(undone)[0].start).toBeCloseTo(2);
  });

  it('moving a clip (same duration) does not change the in-point', () => {
    const { state, layer } = videoState();
    const moved = new MoveLayerTimingCommand(layer.id, 2, 6, 4, 6).execute(state);
    expect(activeLayers(moved)[0].content.mediaInPoint).toBeCloseTo(1);
  });

  it('right trim does not change the in-point', () => {
    const { state, layer } = videoState();
    const trimmed = new MoveLayerTimingCommand(layer.id, 2, 6, 2, 4).execute(state);
    expect(activeLayers(trimmed)[0].content.mediaInPoint).toBeCloseTo(1);
  });
});
