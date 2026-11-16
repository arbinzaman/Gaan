// Web Audio API sound effects + iOS Safari synchronous <audio> gesture unlock

let audioCtx: AudioContext | null = null;
let registeredAudioEl: HTMLAudioElement | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (Ctor) {
      audioCtx = new Ctor();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export const AudioService = {
  registerAudioElement(el: HTMLAudioElement | null): void {
    registeredAudioEl = el;
  },

  // Must be called synchronously inside a user tap/click handler on iOS Safari
  // so the native <audio> element is unlocked for background & Lock Screen playback.
  triggerPlayGesture(): void {
    if (!registeredAudioEl) return;
    try {
      if (registeredAudioEl.src && registeredAudioEl.paused) {
        registeredAudioEl.play().catch(() => {});
      }
    } catch {
      // Ignore
    }
  },

  triggerPauseGesture(): void {
    if (!registeredAudioEl) return;
    try {
      if (!registeredAudioEl.paused) {
        registeredAudioEl.pause();
      }
    } catch {
      // Ignore
    }
  },

  playMicOnSound(): void {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(783.99, now + 0.09);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Ignore audio errors
    }
  },

  playMicOffSound(): void {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.setValueAtTime(440.0, now + 0.08);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.21);
    } catch {
      // Ignore audio errors
    }
  },

  playCommandSuccessSound(): void {
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch {
      // Ignore audio errors
    }
  },

  setBackgroundKeepAlive(_isPlaying: boolean): void {
    // Handled directly by the native HTML5 <audio> stream in YouTubePlayer
  },
};
