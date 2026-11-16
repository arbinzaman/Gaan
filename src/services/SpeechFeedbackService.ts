let activeTtsAudio: HTMLAudioElement | null = null;
let isCurrentlySpeaking = false;
let speakingWatchdogTimer: number | null = null;
const speakingListeners = new Set<(speaking: boolean) => void>();

function notifySpeaking(speaking: boolean): void {
  if (speakingWatchdogTimer !== null) {
    window.clearTimeout(speakingWatchdogTimer);
    speakingWatchdogTimer = null;
  }

  isCurrentlySpeaking = speaking;

  // Safety watchdog: never allow speaking state to stay stuck true
  if (speaking && typeof window !== 'undefined') {
    speakingWatchdogTimer = window.setTimeout(() => {
      isCurrentlySpeaking = false;
      for (const listener of speakingListeners) {
        try {
          listener(false);
        } catch {
          // Ignore
        }
      }
    }, 4500);
  }

  for (const listener of speakingListeners) {
    try {
      listener(speaking);
    } catch {
      // Ignore listener error
    }
  }
}

function speakWithBrowserFallback(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    notifySpeaking(false);
    return;
  }

  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    synth.resume();

    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = 'en-IN';
    utterance.rate = 1.1;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = synth.getVoices() || [];
    const indianVoice =
      voices.find(
        (v) => v.localService && v.lang.toLowerCase().startsWith('en-in')
      ) ||
      voices.find((v) => v.lang.toLowerCase().startsWith('en-in')) ||
      voices.find(
        (v) => v.localService && v.lang.toLowerCase().startsWith('en')
      );

    if (indianVoice) {
      utterance.voice = indianVoice;
    }

    utterance.onend = () => notifySpeaking(false);
    utterance.onerror = () => notifySpeaking(false);
    synth.speak(utterance);
  } catch {
    notifySpeaking(false);
  }
}

export const SpeechFeedbackService = {
  isSpeaking(): boolean {
    return isCurrentlySpeaking;
  },

  onSpeakingChange(listener: (speaking: boolean) => void): () => void {
    speakingListeners.add(listener);
    return () => {
      speakingListeners.delete(listener);
    };
  },

  speak(text: string, enabled = true, _lang = 'en-IN'): void {
    if (!enabled || !text.trim() || typeof window === 'undefined') {
      return;
    }

    // Stop any previous audio or synthesis immediately so two voices never overlap
    if (activeTtsAudio) {
      try {
        activeTtsAudio.onended = null;
        activeTtsAudio.onerror = null;
        activeTtsAudio.pause();
        activeTtsAudio.src = '';
      } catch {
        // Ignore
      }
      activeTtsAudio = null;
    }

    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }

    // Primary: Play crisp natural human voice via /api/tts MP3 stream
    try {
      notifySpeaking(true);
      const audio = new Audio(
        `/api/tts?text=${encodeURIComponent(text.trim())}&lang=en-IN`
      );
      audio.volume = 1.0;
      audio.playbackRate = 1.08;
      activeTtsAudio = audio;

      audio.onended = () => {
        activeTtsAudio = null;
        notifySpeaking(false);
      };
      audio.onerror = () => {
        activeTtsAudio = null;
        speakWithBrowserFallback(text);
      };

      audio.play().catch(() => {
        activeTtsAudio = null;
        speakWithBrowserFallback(text);
      });
    } catch {
      speakWithBrowserFallback(text);
    }
  },
};

export class WakeLockController {
  private sentinel: WakeLockSentinel | null = null;
  private onStatusChange?: (active: boolean) => void;

  constructor(onStatusChange?: (active: boolean) => void) {
    this.onStatusChange = onStatusChange;
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  public async request(): Promise<boolean> {
    if (!this.isSupported()) {
      this.onStatusChange?.(false);
      return false;
    }

    try {
      if (this.sentinel && !this.sentinel.released) {
        this.onStatusChange?.(true);
        return true;
      }
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.onStatusChange?.(false);
      });
      this.onStatusChange?.(true);
      return true;
    } catch {
      this.onStatusChange?.(false);
      return false;
    }
  }

  public async release(): Promise<void> {
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        // Ignore release error
      }
      this.sentinel = null;
    }
    this.onStatusChange?.(false);
  }
}
