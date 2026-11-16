import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  AlertCircle,
} from 'lucide-react';
import {
  BrowserCapabilities,
  ParsedVoiceCommand,
  UserPreferences,
  VoiceLogEntry,
  VoiceStatus,
} from '../types/music';
import {
  CommandDeduplicator,
  getVoiceActionDescription,
  parseVoiceCommand,
} from '../services/VoiceCommandParser';
import { AudioService } from '../services/AudioService';
import { SpeechFeedbackService } from '../services/SpeechFeedbackService';
import { LocalSpeechEngine } from '../services/LocalSpeechEngine';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [altIndex: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export interface VoiceAssistantProps {
  preferences: UserPreferences;
  capabilities: BrowserCapabilities;
  isListeningDesired: boolean;
  onToggleListening: (desired: boolean) => void;
  onCommandRecognized: (cmd: ParsedVoiceCommand) => Promise<{
    success: boolean;
    feedback: string;
  }> | {
    success: boolean;
    feedback: string;
  };
  voiceStatus: VoiceStatus;
  setVoiceStatus: React.Dispatch<React.SetStateAction<VoiceStatus>>;
  liveTranscript: string;
  setLiveTranscript: React.Dispatch<React.SetStateAction<string>>;
  lastFeedback: string;
  setLastFeedback: React.Dispatch<React.SetStateAction<string>>;
  voiceLogs: VoiceLogEntry[];
  onAddVoiceLog: (entry: VoiceLogEntry) => void;
  compact?: boolean;
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({
  preferences,
  capabilities,
  isListeningDesired,
  onToggleListening,
  onCommandRecognized,
  voiceStatus,
  setVoiceStatus,
  liveTranscript,
  setLiveTranscript,
  lastFeedback,
  setLastFeedback,
  onAddVoiceLog,
  compact = false,
}) => {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const localEngineRef = useRef<LocalSpeechEngine | null>(null);
  const useLocalFallbackRef = useRef<boolean>(false);
  const deduplicatorRef = useRef<CommandDeduplicator>(new CommandDeduplicator(2200));
  const restartTimerRef = useRef<number | null>(null);
  const statusResetTimerRef = useRef<number | null>(null);
  const interimDebounceTimerRef = useRef<number | null>(null);
  const latestInterimRef = useRef<string>('');
  const isListeningDesiredRef = useRef<boolean>(isListeningDesired);
  const isActiveOrStartingRef = useRef<boolean>(false);

  const preferencesRef = useRef<UserPreferences>(preferences);
  const capabilitiesRef = useRef<BrowserCapabilities>(capabilities);
  const onCommandRecognizedRef = useRef(onCommandRecognized);
  const onToggleListeningRef = useRef(onToggleListening);
  const onAddVoiceLogRef = useRef(onAddVoiceLog);
  const setVoiceStatusRef = useRef(setVoiceStatus);
  const setLiveTranscriptRef = useRef(setLiveTranscript);
  const setLastFeedbackRef = useRef(setLastFeedback);

  isListeningDesiredRef.current = isListeningDesired;
  preferencesRef.current = preferences;
  capabilitiesRef.current = capabilities;
  onCommandRecognizedRef.current = onCommandRecognized;
  onToggleListeningRef.current = onToggleListening;
  onAddVoiceLogRef.current = onAddVoiceLog;
  setVoiceStatusRef.current = setVoiceStatus;
  setLiveTranscriptRef.current = setLiveTranscript;
  setLastFeedbackRef.current = setLastFeedback;

  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const executeTranscript = useCallback(
    async (
      transcript: string,
      confidence = 1,
      bypassWakeRequirement = false,
      isFromInterim = false
    ) => {
      const cleaned = transcript.trim();
      if (!cleaned) return;
      if (SpeechFeedbackService.isSpeaking()) return;

      const prefs = preferencesRef.current;
      const parsed = parseVoiceCommand(cleaned, {
        wakePhrase: prefs.wakePhrase,
        requireWakePhrase: bypassWakeRequirement ? false : prefs.requireWakePhrase,
        confidence,
      });

      if (parsed.action === 'UNKNOWN') {
        if (isFromInterim) return;
        const msg =
          prefs.requireWakePhrase && !parsed.wakeWordDetected
            ? `Say "${prefs.wakePhrase}" first`
            : `Heard "${cleaned}" — try "play [song]" or "next song"`;
        setLastFeedbackRef.current(msg);
        return;
      }

      if (!deduplicatorRef.current.shouldExecute(parsed)) {
        return;
      }

      latestInterimRef.current = '';
      setVoiceStatusRef.current('processing');
      AudioService.playCommandSuccessSound();

      const result = await Promise.resolve(
        onCommandRecognizedRef.current(parsed)
      );
      const feedbackText = result.feedback || getVoiceActionDescription(parsed);
      setLastFeedbackRef.current(feedbackText);
      setVoiceStatusRef.current(result.success ? 'success' : 'error');

      onAddVoiceLogRef.current({
        id: `vlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        transcript: cleaned,
        action: parsed.action,
        query: parsed.query,
        status: result.success ? 'executed' : 'unrecognized',
        feedbackMessage: feedbackText,
        timestamp: Date.now(),
      });

      if (statusResetTimerRef.current) {
        window.clearTimeout(statusResetTimerRef.current);
      }
      statusResetTimerRef.current = window.setTimeout(() => {
        setVoiceStatusRef.current(
          isListeningDesiredRef.current ? 'listening' : 'idle'
        );
      }, 1500);
    },
    []
  );

  const startLocalFallbackEngine = useCallback(() => {
    useLocalFallbackRef.current = true;
    setErrorReason(null);
    setVoiceStatusRef.current('listening');

    if (!localEngineRef.current) {
      localEngineRef.current = new LocalSpeechEngine({
        onStatus: (message) => {
          setLastFeedbackRef.current(message);
        },
        onReady: () => {
          setVoiceStatusRef.current('listening');
          setLiveTranscriptRef.current('');
          setLastFeedbackRef.current(
            'Listening • Say "Play [song]", "Next", or "Pause"'
          );
        },
        onSpeechDetected: () => {
          setLiveTranscriptRef.current('Hearing your voice...');
        },
        onAudioLevel: (lvl) => {
          setAudioLevel(lvl);
        },
        onTranscript: (text) => {
          setLiveTranscriptRef.current(text);
          executeTranscript(text, 0.95, false, false);
        },
        onError: (msg) => {
          setErrorReason(msg);
          setVoiceStatusRef.current('error');
        },
      });
    }

    localEngineRef.current.start();
  }, [executeTranscript]);

  const stopRecognitionSession = useCallback(() => {
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (interimDebounceTimerRef.current) {
      window.clearTimeout(interimDebounceTimerRef.current);
      interimDebounceTimerRef.current = null;
    }
    isActiveOrStartingRef.current = false;
    latestInterimRef.current = '';
    setAudioLevel(0);

    if (localEngineRef.current) {
      localEngineRef.current.stop();
    }

    const rec = recognitionRef.current;
    if (rec) {
      recognitionRef.current = null;
      try {
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        rec.stop();
      } catch {
        // Ignore stop errors
      }
    }
  }, []);

  const startRecognitionSession = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (isActiveOrStartingRef.current) return;

    if (window.isSecureContext === false) {
      setVoiceStatusRef.current('denied');
      setErrorReason(
        'Microphone requires localhost or HTTPS. Opening via a local IP (http://192.168...) blocks microphone access.'
      );
      onToggleListeningRef.current(false);
      return;
    }

    if (useLocalFallbackRef.current) {
      isActiveOrStartingRef.current = true;
      startLocalFallbackEngine();
      return;
    }

    const SpeechRecognitionCtor = (window.SpeechRecognition ||
      window.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionInstance)
      | undefined;

    if (!SpeechRecognitionCtor) {
      isActiveOrStartingRef.current = true;
      startLocalFallbackEngine();
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionCtor();
    const caps = capabilitiesRef.current;

    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isActiveOrStartingRef.current = true;
      setErrorReason(null);
      setVoiceStatusRef.current('listening');
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (SpeechFeedbackService.isSpeaking()) return;

      let interimText = '';
      let finalText = '';
      let finalConfidence = 1;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0]?.transcript || '';
        if (res.isFinal) {
          finalText += text;
          finalConfidence = res[0]?.confidence ?? 1;
        } else {
          interimText += text;
        }
      }

      if (interimDebounceTimerRef.current) {
        window.clearTimeout(interimDebounceTimerRef.current);
      }

      if (finalText.trim()) {
        const cleanedFinal = finalText.trim();
        latestInterimRef.current = '';
        setLiveTranscriptRef.current(cleanedFinal);
        executeTranscript(cleanedFinal, finalConfidence, false, false);
      } else if (interimText.trim()) {
        const cleanedInterim = interimText.trim();
        latestInterimRef.current = cleanedInterim;
        setLiveTranscriptRef.current(cleanedInterim);

        interimDebounceTimerRef.current = window.setTimeout(() => {
          if (latestInterimRef.current) {
            const pending = latestInterimRef.current;
            latestInterimRef.current = '';
            executeTranscript(pending, 0.9, false, true);
          }
        }, 900);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      const err = event.error;
      if (err === 'network') {
        try {
          recognition.onend = null;
          recognition.stop();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
        startLocalFallbackEngine();
        return;
      }

      if (err === 'not-allowed' || err === 'service-not-allowed') {
        isActiveOrStartingRef.current = false;
        isListeningDesiredRef.current = false;
        onToggleListeningRef.current(false);
        setVoiceStatusRef.current('denied');
        setErrorReason(
          caps.isSafari
            ? 'Safari blocked speech recognition. Allow Microphone for this site and enable Dictation in Settings.'
            : 'Microphone permission blocked. Allow microphone access in the browser address bar.'
        );
      } else if (err === 'audio-capture') {
        isActiveOrStartingRef.current = false;
        setVoiceStatusRef.current('error');
        setErrorReason('No working microphone detected.');
      }
    };

    recognition.onend = () => {
      if (useLocalFallbackRef.current) return;
      isActiveOrStartingRef.current = false;
      recognitionRef.current = null;

      if (latestInterimRef.current && !SpeechFeedbackService.isSpeaking()) {
        const leftover = latestInterimRef.current;
        latestInterimRef.current = '';
        executeTranscript(leftover, 0.85, false, true);
      }

      if (
        isListeningDesiredRef.current &&
        !SpeechFeedbackService.isSpeaking() &&
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible'
      ) {
        if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = window.setTimeout(() => {
          if (
            isListeningDesiredRef.current &&
            !isActiveOrStartingRef.current &&
            !SpeechFeedbackService.isSpeaking() &&
            document.visibilityState === 'visible'
          ) {
            startRecognitionSession();
          }
        }, 250);
      } else if (!isListeningDesiredRef.current) {
        setVoiceStatusRef.current((prev) =>
          prev === 'denied' ? 'denied' : 'idle'
        );
      }
    };

    recognitionRef.current = recognition;
    isActiveOrStartingRef.current = true;

    try {
      recognition.start();
    } catch {
      isActiveOrStartingRef.current = false;
    }
  }, [executeTranscript, startLocalFallbackEngine]);

  useEffect(() => {
    if (isListeningDesired) {
      startRecognitionSession();
    } else {
      stopRecognitionSession();
      setVoiceStatusRef.current((prev) =>
        prev === 'denied' ? 'denied' : 'idle'
      );
    }
  }, [isListeningDesired, startRecognitionSession, stopRecognitionSession]);

  useEffect(() => {
    return () => {
      stopRecognitionSession();
    };
  }, [stopRecognitionSession]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopRecognitionSession();
      } else if (
        document.visibilityState === 'visible' &&
        isListeningDesiredRef.current
      ) {
        window.setTimeout(() => {
          if (isListeningDesiredRef.current) {
            startRecognitionSession();
          }
        }, 250);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [startRecognitionSession, stopRecognitionSession]);

  const handleMicButtonClick = () => {
    if (isListeningDesired) {
      AudioService.playMicOffSound();
      isListeningDesiredRef.current = false;
      onToggleListening(false);
      stopRecognitionSession();
      setVoiceStatus('idle');
    } else {
      AudioService.playMicOnSound();
      isListeningDesiredRef.current = true;
      onToggleListening(true);
      startRecognitionSession();
    }
  };

  if (compact) {
    return null;
  }

  return (
    <div className="mx-auto max-w-md w-full">
      <div className="relative overflow-hidden flex items-center justify-between gap-3 rounded-2xl border border-zinc-800/70 bg-obsidian-900/75 backdrop-blur-md px-3.5 py-2.5 shadow-sm">
        {isListeningDesired && audioLevel > 0 && (
          <div
            className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-emerald-400 transition-all duration-75"
            style={{ width: `${Math.min(100, audioLevel)}%` }}
          />
        )}

        <button
          type="button"
          onClick={handleMicButtonClick}
          className="flex items-center gap-3 min-w-0 flex-1 text-left group"
        >
          <span
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${
              voiceStatus === 'listening'
                ? 'bg-emerald-500 text-obsidian-950 shadow-md shadow-emerald-500/25'
                : voiceStatus === 'processing'
                ? 'bg-cyan-400 text-obsidian-950 animate-pulse'
                : voiceStatus === 'denied' || voiceStatus === 'error'
                ? 'bg-rose-500/20 text-rose-400'
                : 'bg-zinc-800/90 text-zinc-300 group-hover:bg-zinc-700'
            }`}
          >
            {voiceStatus === 'listening' && (
              <span className="absolute inset-0 rounded-xl bg-emerald-400 animate-ping opacity-25 pointer-events-none" />
            )}
            {isListeningDesired ? (
              <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-zinc-100 truncate">
              {voiceStatus === 'listening'
                ? liveTranscript
                  ? `"${liveTranscript}"`
                  : lastFeedback ||
                    'Listening • Say "Play [song]", "Next", or "Pause"'
                : voiceStatus === 'processing'
                ? 'Processing command...'
                : voiceStatus === 'success'
                ? lastFeedback
                : voiceStatus === 'denied'
                ? 'Microphone blocked'
                : 'Tap Mic for voice control'}
            </span>
            {voiceStatus !== 'listening' && lastFeedback && (
              <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                {lastFeedback}
              </p>
            )}
          </div>
        </button>
      </div>

      {errorReason && (
        <div className="mt-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
          <span>{errorReason}</span>
        </div>
      )}
    </div>
  );
};
