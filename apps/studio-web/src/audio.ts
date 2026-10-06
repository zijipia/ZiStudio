export class AudioEngine {
  private ctx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isMuted = false;
  private volume = 0.5;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = this.volume;
        this.gainNode.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // --- Clip output (used by AudioController) -------------------------------

  /** `unavailable` until the first call that needs sound (the context is created lazily). */
  get state(): 'running' | 'suspended' | 'unavailable' {
    if (!this.ctx) return 'unavailable';
    return this.ctx.state === 'running' ? 'running' : 'suspended';
  }

  /** The audio hardware clock, in seconds. It is the master clock while audio plays. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Seconds between a sample being scheduled and being heard. */
  get latency(): number {
    if (!this.ctx) return 0;
    return this.ctx.outputLatency || this.ctx.baseLatency || 0;
  }

  resume(): void {
    try {
      this.init();
    } catch {
      // No audio device: playback continues on the frame clock.
    }
  }

  /**
   * Schedule `duration` seconds of `buffer` (from `offset`) at context time `when`, through its
   * own gain stage so the level can change while it plays. Returns a voice to stop or re-level.
   */
  playBuffer(
    buffer: AudioBuffer,
    when: number,
    offset: number,
    duration: number,
    gain = 1
  ): { stop(): void; setGain(gain: number): void } {
    const ctx = this.ctx;
    const master = this.gainNode;
    if (!ctx || !master) return { stop() {}, setGain() {} };
    const node = ctx.createBufferSource();
    const level = ctx.createGain();
    level.gain.value = gain;
    node.buffer = buffer;
    node.connect(level);
    level.connect(master);
    node.start(when, offset, duration);
    return {
      stop() {
        try {
          node.stop();
        } catch {
          // already ended
        }
        node.disconnect();
        level.disconnect();
      },
      setGain(next: number) {
        // a short ramp instead of a jump, so dragging a fader does not click
        level.gain.setTargetAtTime(next, ctx.currentTime, 0.01);
      },
    };
  }

  playTone(freq = 440, duration = 0.1) {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx || !this.gainNode) return;

      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      noteGain.gain.setValueAtTime(this.volume * 0.15, this.ctx.currentTime);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(noteGain);
      noteGain.connect(this.gainNode);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // Audio error safely ignored in headless / background environments
    }
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  getMuted(): boolean {
    return this.isMuted;
  }
}

export const audioEngine = new AudioEngine();
