import { describe, expect, it } from 'vitest';
import { evaluateProperty, evaluateTransform } from '../animation';
import { createProperty, createTransform, type Keyframe } from '../model';

const kf = (time: number, value: number, interpolation: Keyframe['interpolation'] = 'linear'): Keyframe<number> => ({
  id: `kf-${time}`,
  time,
  value,
  interpolation,
});

describe('evaluateProperty', () => {
  it('returns the static value when there are no keyframes', () => {
    expect(evaluateProperty(createProperty<number>('p', 'P', 42), 3)).toBe(42);
  });

  it('clamps to first/last keyframe outside the range', () => {
    const p = createProperty<number>('p', 'P', 0);
    p.keyframes = [kf(1, 10), kf(2, 20)];
    expect(evaluateProperty(p, 0)).toBe(10);
    expect(evaluateProperty(p, 5)).toBe(20);
  });

  it('interpolates linearly between keyframes', () => {
    const p = createProperty<number>('p', 'P', 0);
    p.keyframes = [kf(0, 0), kf(2, 100)];
    expect(evaluateProperty(p, 1)).toBeCloseTo(50);
    expect(evaluateProperty(p, 0.5)).toBeCloseTo(25);
  });

  it('does not depend on keyframe array order', () => {
    const p = createProperty<number>('p', 'P', 0);
    p.keyframes = [kf(2, 100), kf(0, 0)];
    expect(evaluateProperty(p, 1)).toBeCloseTo(50);
  });

  it('holds the left value with hold interpolation', () => {
    const p = createProperty<number>('p', 'P', 0);
    p.keyframes = [kf(0, 5, 'hold'), kf(2, 100)];
    expect(evaluateProperty(p, 1.9)).toBe(5);
  });

  it('interpolates vectors per component', () => {
    const p = createProperty<[number, number, number]>('p', 'P', [0, 0, 0]);
    p.keyframes = [
      { id: 'a', time: 0, value: [0, 0, 0], interpolation: 'linear' },
      { id: 'b', time: 1, value: [10, 20, 30], interpolation: 'linear' },
    ];
    const v = evaluateProperty(p, 0.5);
    expect(v[0]).toBeCloseTo(5);
    expect(v[1]).toBeCloseTo(10);
    expect(v[2]).toBeCloseTo(15);
  });

  it('eased interpolation stays within [left, right] and hits the endpoints', () => {
    for (const interp of ['ease-in', 'ease-out', 'ease-in-out', 'bezier'] as const) {
      const p = createProperty<number>('p', 'P', 0);
      p.keyframes = [kf(0, 0, interp), kf(1, 100)];
      expect(evaluateProperty(p, 0)).toBeCloseTo(0);
      expect(evaluateProperty(p, 1)).toBeCloseTo(100);
      for (let t = 0.05; t < 1; t += 0.05) {
        const v = evaluateProperty(p, t);
        expect(v).toBeGreaterThanOrEqual(-0.0001);
        expect(v).toBeLessThanOrEqual(100.0001);
      }
    }
  });
});

describe('evaluateTransform', () => {
  it('returns defaults for a fresh transform', () => {
    const t = evaluateTransform(createTransform('x'), 0);
    expect(t.position).toEqual([0, 0, 0]);
    expect(t.scale).toEqual([100, 100, 100]);
    expect(t.opacity).toBe(100);
  });

  it('clamps opacity to 0..100', () => {
    const tr = createTransform('x');
    tr.opacity.value = 250;
    expect(evaluateTransform(tr, 0).opacity).toBe(100);
    tr.opacity.value = -5;
    expect(evaluateTransform(tr, 0).opacity).toBe(0);
  });
});
