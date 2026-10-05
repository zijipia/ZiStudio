import { getActiveComposition } from '../editor';
import type { EditorRuntime } from './editor-runtime';
import { advanceTime, stepFrameTime } from './playback-math';

/** Abstraction over requestAnimationFrame so the controller is testable without a DOM. */
export interface FrameClock {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

export function createBrowserClock(): FrameClock {
  return {
    request: (cb) => requestAnimationFrame(cb),
    cancel: (h) => cancelAnimationFrame(h),
    now: () => performance.now(),
  };
}

export class PlaybackController {
  private handle: number | null = null;
  private lastTick = 0;

  constructor(
    private readonly runtime: EditorRuntime,
    private readonly clock: FrameClock
  ) {}

  get isPlaying(): boolean {
    return this.runtime.getState().isPlaying;
  }

  play(): void {
    if (this.isPlaying) return;
    const state = this.runtime.getState();
    const comp = getActiveComposition(state);
    // Pressing play on the last frame restarts from the beginning.
    const startTime = !state.isLooping && state.currentTime >= comp.duration ? 0 : state.currentTime;
    this.runtime.update((s) => ({ ...s, currentTime: startTime, isPlaying: true }));
    this.startLoop();
  }

  pause(): void {
    this.stopLoop();
    if (this.isPlaying) this.runtime.update((s) => ({ ...s, isPlaying: false }));
  }

  toggle(): void {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  seek(time: number): void {
    this.runtime.update((s) => {
      const comp = getActiveComposition(s);
      const next = Math.max(0, Math.min(comp.duration, time));
      return next === s.currentTime ? s : { ...s, currentTime: next };
    });
  }

  stepFrames(frames: number): void {
    this.runtime.update((s) => {
      const comp = getActiveComposition(s);
      return { ...s, currentTime: stepFrameTime(s.currentTime, frames, comp.fps, comp.duration) };
    });
  }

  jumpToStart(): void {
    this.seek(0);
  }

  jumpToEnd(): void {
    this.seek(getActiveComposition(this.runtime.getState()).duration);
  }

  setLoop(loop: boolean): void {
    this.runtime.update((s) => (s.isLooping === loop ? s : { ...s, isLooping: loop }));
  }

  toggleLoop(): void {
    this.setLoop(!this.runtime.getState().isLooping);
  }

  dispose(): void {
    this.stopLoop();
  }

  private startLoop(): void {
    this.stopLoop();
    this.lastTick = this.clock.now();
    const tick = (now: number) => {
      const dt = Math.max(0, (now - this.lastTick) / 1000);
      this.lastTick = now;
      this.runtime.update((s) => {
        const comp = getActiveComposition(s);
        const { time, ended } = advanceTime(s.currentTime, dt, comp.duration, s.isLooping);
        return { ...s, currentTime: time, isPlaying: ended ? false : s.isPlaying };
      });
      this.handle = this.isPlaying ? this.clock.request(tick) : null;
    };
    this.handle = this.clock.request(tick);
  }

  private stopLoop(): void {
    if (this.handle !== null) {
      this.clock.cancel(this.handle);
      this.handle = null;
    }
  }
}
