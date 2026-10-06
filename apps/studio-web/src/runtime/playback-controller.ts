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
    this.runtime.media.setPlaying(true);
    this.runtime.audio.start(comp, startTime);
    this.startLoop();
  }

  pause(): void {
    this.stopLoop();
    this.runtime.media.setPlaying(false);
    this.runtime.audio.stop();
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
    // Seeking while playing: audio must be re-anchored at the new position.
    if (this.isPlaying) {
      const state = this.runtime.getState();
      this.runtime.audio.start(getActiveComposition(state), state.currentTime);
    }
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
      // While audio is playing its output clock is the master: the playhead is read from it, so
      // the picture follows what is heard. Without audio (or before the browser lets the audio
      // context run) the frame clock drives the playhead.
      const audioTime = this.runtime.audio.clockTime();
      let wrapped = false;
      let ended = false;
      this.runtime.update((s) => {
        const comp = getActiveComposition(s);
        const result =
          audioTime !== null
            ? advanceTime(audioTime, 0, comp.duration, s.isLooping)
            : advanceTime(s.currentTime, dt, comp.duration, s.isLooping);
        ended = result.ended;
        // On the audio clock a wrap is "the clock passed the end", which also holds after a long
        // stall (hidden tab) when the previous playhead was nowhere near the end.
        wrapped =
          !result.ended &&
          (audioTime !== null ? audioTime >= comp.duration : result.time < s.currentTime - 1e-9);
        return { ...s, currentTime: result.time, isPlaying: result.ended ? false : s.isPlaying };
      });
      const state = this.runtime.getState();
      if (ended) {
        this.runtime.media.setPlaying(false);
        this.runtime.audio.stop();
      } else if (wrapped) {
        this.runtime.audio.start(getActiveComposition(state), state.currentTime);
      } else {
        this.runtime.audio.sync();
      }
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
