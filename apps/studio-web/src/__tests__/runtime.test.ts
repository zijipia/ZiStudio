import { describe, expect, it } from 'vitest';
import { createProject, createSolidLayer } from '../model';
import { EditorRuntime } from '../runtime/editor-runtime';
import type { AudioController } from '../runtime/audio-controller';
import type { MediaController } from '../runtime/media-controller';
import type { FrameClock } from '../runtime/playback-controller';

class FakeClock implements FrameClock {
  private t = 0;
  private cb: ((now: number) => void) | null = null;
  private next = 1;
  request(cb: (now: number) => void) {
    this.cb = cb;
    return this.next++;
  }
  cancel() {
    this.cb = null;
  }
  now() {
    return this.t;
  }
  /** Advance the fake time and run one animation frame. */
  tick(ms: number) {
    this.t += ms;
    const cb = this.cb;
    this.cb = null;
    cb?.(this.t);
  }
  get pending() {
    return this.cb !== null;
  }
}

const stubMedia = { setPlaying() {}, reset() {}, dispose() {}, release() {}, probe: async () => ({ kind: 'video' as const }) } as unknown as MediaController;

function makeRuntime() {
  const clock = new FakeClock();
  const runtime = new EditorRuntime(createProject(), { clock, media: stubMedia });
  return { runtime, clock };
}

const comp = (r: EditorRuntime) => r.getState().project.compositions[0];

function makeAudioRuntime() {
  const clock = new FakeClock();
  const audio = {
    audioTime: null as number | null,
    starts: [] as Array<{ time: number }>,
    stops: 0,
    syncs: 0,
    clockTime() {
      return this.audioTime;
    },
    start(_c: unknown, time: number) {
      this.starts.push({ time });
    },
    stop() {
      this.stops += 1;
    },
    sync() {
      this.syncs += 1;
    },
    syncLayers() {},
    reset() {},
    release() {},
    dispose() {},
  };
  const runtime = new EditorRuntime(createProject(), { clock, media: stubMedia, audio: audio as unknown as AudioController });
  return { runtime, clock, audio };
}

describe('A/V clock', () => {
  it('starts audio at the playhead and keeps it topped up every frame', () => {
    const { runtime, clock, audio } = makeAudioRuntime();
    runtime.playback.seek(1);
    runtime.playback.play();
    expect(audio.starts.at(-1)?.time).toBe(1);
    clock.tick(16);
    clock.tick(16);
    expect(audio.syncs).toBe(2);
  });

  it('follows the audio clock instead of frame deltas while audio drives the transport', () => {
    const { runtime, clock, audio } = makeAudioRuntime();
    runtime.playback.play();
    audio.audioTime = 0.5;
    clock.tick(100); // the frame clock says 0.1s, the audio clock says 0.5s: audio wins
    expect(runtime.getState().currentTime).toBeCloseTo(0.5);
    audio.audioTime = 0.62;
    clock.tick(1000); // a long frame stall does not move the playhead beyond the audio
    expect(runtime.getState().currentTime).toBeCloseTo(0.62);
  });

  it('falls back to the frame clock when the audio clock is unavailable', () => {
    const { runtime, clock, audio } = makeAudioRuntime();
    runtime.playback.play();
    audio.audioTime = null;
    clock.tick(250);
    expect(runtime.getState().currentTime).toBeCloseTo(0.25);
  });

  it('re-anchors audio when looping wraps and when seeking during playback', () => {
    const { runtime, clock, audio } = makeAudioRuntime();
    const duration = comp(runtime).duration;
    runtime.playback.play();
    audio.audioTime = duration + 0.2;
    clock.tick(16);
    expect(runtime.getState().isPlaying).toBe(true);
    expect(runtime.getState().currentTime).toBeCloseTo(0.2);
    expect(audio.starts.at(-1)?.time).toBeCloseTo(0.2);
    const startsBefore = audio.starts.length;
    runtime.playback.seek(4);
    expect(audio.starts.length).toBe(startsBefore + 1);
    expect(audio.starts.at(-1)?.time).toBe(4);
  });

  it('stops audio on pause and when playback ends', () => {
    const { runtime, clock, audio } = makeAudioRuntime();
    runtime.playback.setLoop(false);
    runtime.playback.play();
    runtime.playback.pause();
    expect(audio.stops).toBeGreaterThanOrEqual(1);
    const stopsBefore = audio.stops;
    runtime.playback.play();
    audio.audioTime = comp(runtime).duration + 1;
    clock.tick(16);
    expect(runtime.getState().isPlaying).toBe(false);
    expect(runtime.getState().currentTime).toBe(comp(runtime).duration);
    expect(audio.stops).toBeGreaterThan(stopsBefore);
  });
});

describe('PlaybackController', () => {
  it('advances time by the elapsed clock time while playing', () => {
    const { runtime, clock } = makeRuntime();
    runtime.playback.play();
    clock.tick(500);
    expect(runtime.getState().currentTime).toBeCloseTo(0.5);
    clock.tick(250);
    expect(runtime.getState().currentTime).toBeCloseTo(0.75);
  });

  it('loops at the end when looping is on', () => {
    const { runtime, clock } = makeRuntime();
    runtime.playback.seek(comp(runtime).duration - 0.1);
    runtime.playback.play();
    clock.tick(300);
    expect(runtime.getState().isPlaying).toBe(true);
    expect(runtime.getState().currentTime).toBeCloseTo(0.2);
  });

  it('stops at the end when looping is off, and replays from the start', () => {
    const { runtime, clock } = makeRuntime();
    runtime.playback.setLoop(false);
    runtime.playback.seek(comp(runtime).duration - 0.1);
    runtime.playback.play();
    clock.tick(300);
    expect(runtime.getState().isPlaying).toBe(false);
    expect(runtime.getState().currentTime).toBe(comp(runtime).duration);
    expect(clock.pending).toBe(false);
    runtime.playback.play();
    expect(runtime.getState().currentTime).toBe(0);
    expect(runtime.getState().isPlaying).toBe(true);
  });

  it('pause cancels the frame loop', () => {
    const { runtime, clock } = makeRuntime();
    runtime.playback.play();
    runtime.playback.pause();
    expect(clock.pending).toBe(false);
    expect(runtime.getState().isPlaying).toBe(false);
  });

  it('seek clamps and steps move by whole frames', () => {
    const { runtime } = makeRuntime();
    runtime.playback.seek(-5);
    expect(runtime.getState().currentTime).toBe(0);
    runtime.playback.stepFrames(30);
    expect(runtime.getState().currentTime).toBeCloseTo(30 / comp(runtime).fps);
    runtime.playback.seek(9999);
    expect(runtime.getState().currentTime).toBe(comp(runtime).duration);
  });
});

describe('EditorRuntime', () => {
  it('notifies subscribers only on real state changes', () => {
    const { runtime } = makeRuntime();
    let calls = 0;
    runtime.subscribe(() => (calls += 1));
    runtime.playback.seek(1);
    runtime.playback.seek(1); // same value: no-op
    expect(calls).toBe(1);
  });

  it('does not record no-op commands in the undo history', () => {
    const { runtime } = makeRuntime();
    runtime.composition.splitLayer('does-not-exist');
    expect(runtime.commands.canUndo()).toBe(false);
  });

  it('adds a layer, undoes and redoes it', () => {
    const { runtime } = makeRuntime();
    const before = comp(runtime).layers.length;
    runtime.composition.addLayer('solid');
    expect(comp(runtime).layers).toHaveLength(before + 1);
    runtime.undo();
    expect(comp(runtime).layers).toHaveLength(before);
    runtime.redo();
    expect(comp(runtime).layers).toHaveLength(before + 1);
  });

  it('animation controller toggles a keyframe on the selected layer at the playhead', () => {
    const { runtime } = makeRuntime();
    const layer = createSolidLayer('x', '#000');
    runtime.composition.addLayer('solid');
    const id = runtime.selection.selectedLayerId!;
    runtime.playback.seek(1);
    runtime.animation.toggleKeyframe('position');
    expect(comp(runtime).layers.find((l) => l.id === id)!.transform.position.keyframes).toHaveLength(1);
    runtime.animation.toggleKeyframe('position');
    expect(comp(runtime).layers.find((l) => l.id === id)!.transform.position.keyframes).toHaveLength(0);
    void layer;
  });

  it('loadProject resets history, selection and pauses playback', () => {
    const { runtime } = makeRuntime();
    runtime.composition.addLayer('text');
    runtime.playback.play();
    runtime.loadProject(createProject());
    expect(runtime.commands.canUndo()).toBe(false);
    expect(runtime.getState().isPlaying).toBe(false);
    expect(runtime.getState().currentTime).toBe(0);
  });
});
