export interface AdvanceResult {
  time: number;
  /** True when playback reached the end and looping is off. */
  ended: boolean;
}

/** Advance playhead time by dt seconds, honoring loop / end-of-composition. */
export function advanceTime(time: number, dt: number, duration: number, loop: boolean): AdvanceResult {
  const next = time + dt;
  if (next >= duration) {
    if (loop) return { time: duration > 0 ? next % duration : 0, ended: false };
    return { time: duration, ended: true };
  }
  return { time: Math.max(0, next), ended: false };
}

export function stepFrameTime(time: number, frames: number, fps: number, duration: number): number {
  return Math.max(0, Math.min(duration, time + frames / fps));
}

/** Snap a time to the nearest frame boundary (floor with epsilon to avoid 29.999 -> 29). */
export function frameIndex(time: number, fps: number): number {
  return Math.floor(time * fps + 1e-6);
}

export function formatTimecode(time: number, fps: number): string {
  const rate = Math.max(1, Math.round(fps));
  const totalFrames = frameIndex(time, rate);
  const frames = totalFrames % rate;
  const totalSeconds = Math.floor(totalFrames / rate);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}
