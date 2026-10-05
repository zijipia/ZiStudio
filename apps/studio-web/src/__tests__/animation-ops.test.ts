import { describe, expect, it } from 'vitest';
import { CommandManager } from '../editor';
import { advanceTime, formatTimecode, stepFrameTime } from '../runtime/playback-math';
import {
  buildSetTransformValue,
  buildToggleKeyframe,
  buildTranslate,
  findAdjacentKeyframeTime,
} from '../runtime/animation-ops';
import { activeLayers, makeState } from './helpers';

describe('animation ops', () => {
  it('toggle adds then removes a keyframe at the playhead', () => {
    const { state, layers } = makeState(1);
    const mgr = new CommandManager();
    let s = mgr.execute(buildToggleKeyframe(layers[0], 'position', 1), state);
    expect(activeLayers(s)[0].transform.position.keyframes).toHaveLength(1);
    s = mgr.execute(buildToggleKeyframe(activeLayers(s)[0], 'position', 1.02), s);
    expect(activeLayers(s)[0].transform.position.keyframes).toHaveLength(0);
  });

  it('axis edit on an animated property keeps the other axes at their evaluated value', () => {
    const { state, layers } = makeState(1);
    layers[0].transform.position.keyframes = [
      { id: 'k0', time: 0, value: [0, 0, 0], interpolation: 'linear' },
      { id: 'k2', time: 2, value: [100, 200, 0], interpolation: 'linear' },
    ];
    const mgr = new CommandManager();
    // Edit X at t=1, where the evaluated Y is 100 (the static base value is 0).
    const s = mgr.execute(buildSetTransformValue(layers[0], 'position', 0, 50, 1), state);
    const kf = activeLayers(s)[0].transform.position.keyframes.find((k) => Math.abs(k.time - 1) < 0.01)!;
    expect(kf.value).toEqual([50, 100, 0]); // regression: Y used to snap back to the static 0
  });

  it('translate is a single undoable step touching both axes', () => {
    const { state, layers } = makeState(1);
    const mgr = new CommandManager();
    const s = mgr.execute(buildTranslate(layers[0], 10, -4, 0), state);
    expect(activeLayers(s)[0].transform.position.value).toEqual([10, -4, 0]);
    const u = mgr.undo(s);
    expect(activeLayers(u)[0].transform.position.value).toEqual([0, 0, 0]);
    expect(mgr.canUndo()).toBe(false);
  });

  it('translate on an animated property writes both axes into one keyframe', () => {
    const { state, layers } = makeState(1);
    const mgr = new CommandManager();
    let s = mgr.execute(buildToggleKeyframe(layers[0], 'position', 1), state);
    s = mgr.execute(buildTranslate(activeLayers(s)[0], 7, 9, 1), s);
    const kfs = activeLayers(s)[0].transform.position.keyframes;
    expect(kfs).toHaveLength(1);
    expect(kfs[0].value).toEqual([7, 9, 0]);
  });

  it('finds adjacent keyframes', () => {
    const { state, layers } = makeState(1);
    const mgr = new CommandManager();
    let s = state;
    for (const t of [1, 2, 3]) s = mgr.execute(buildToggleKeyframe(activeLayers(s)[0], 'opacity', t), s);
    const layer = activeLayers(s)[0];
    expect(findAdjacentKeyframeTime(layer, 'opacity', 2, -1)).toBe(1);
    expect(findAdjacentKeyframeTime(layer, 'opacity', 2, 1)).toBe(3);
    expect(findAdjacentKeyframeTime(layer, 'opacity', 0.5, -1)).toBeNull();
    expect(findAdjacentKeyframeTime(layer, 'opacity', 3, 1)).toBeNull();
    void layers;
  });
});

describe('playback math', () => {
  it('advances, loops and ends', () => {
    expect(advanceTime(1, 0.5, 10, true)).toEqual({ time: 1.5, ended: false });
    expect(advanceTime(9.9, 0.3, 10, true).time).toBeCloseTo(0.2);
    expect(advanceTime(9.9, 0.3, 10, false)).toEqual({ time: 10, ended: true });
  });

  it('steps frames within bounds', () => {
    expect(stepFrameTime(0, -1, 30, 10)).toBe(0);
    expect(stepFrameTime(9.99, 5, 30, 10)).toBe(10);
    expect(stepFrameTime(1, 3, 30, 10)).toBeCloseTo(1.1);
  });

  it('formats SMPTE timecode without float truncation errors', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00:00');
    expect(formatTimecode(1, 30)).toBe('00:00:01:00');
    expect(formatTimecode(61.5, 30)).toBe('00:01:01:15');
    // 29 frames * (1/30) accumulates to 0.9666..; stepping one more must land on 1s exactly
    let t = 0;
    for (let i = 0; i < 30; i += 1) t += 1 / 30;
    expect(formatTimecode(t, 30)).toBe('00:00:01:00');
  });
});

describe('frameIndex', () => {
  it('is epsilon-safe at exact frame boundaries (float accumulation)', async () => {
    const { frameIndex } = await import('../runtime/playback-math');
    let t = 0;
    for (let i = 0; i < 5; i += 1) t += 1 / 60; // 4.999999... style drift
    expect(frameIndex(t, 60)).toBe(5);
    expect(frameIndex(5 / 60, 60)).toBe(5);
    expect(frameIndex(10, 60)).toBe(600);
  });
});
