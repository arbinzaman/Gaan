import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Volume1,
  X,
  Moon,
  Sun,
} from 'lucide-react';
import {
  BrowserCapabilities,
  Track,
  UserPreferences,
  VoiceStatus,
} from '../types/music';

interface RidingModeProps {
  currentTrack: Track;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  voiceStatus: VoiceStatus;
  isListeningDesired: boolean;
  liveTranscript: string;
  lastFeedback: string;
  wakeLockActive: boolean;
  preferences: UserPreferences;
  capabilities: BrowserCapabilities;
  onToggleListening: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onVolumeUp: () => void;
  onVolumeDown: () => void;
  onToggleVoiceFeedback: () => void;
  onExitRidingMode: () => void;
}

export const RidingMode: React.FC<RidingModeProps> = ({
  currentTrack,
  isPlaying,
  volume,
  isMuted,
  voiceStatus,
  isListeningDesired,
  liveTranscript,
  lastFeedback,
  wakeLockActive,
  preferences,
  onToggleListening,
  onTogglePlay,
  onNext,
  onPrevious,
  onVolumeUp,
  onVolumeDown,
  onExitRidingMode,
}) => {
  const [pocketDimmed, setPocketDimmed] = useState(false);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-between transition-colors duration-300 select-none ${pocketDimmed ? 'bg-black text-zinc-500' : 'bg-obsidian-950 text-white'
        } p-5 sm:p-8`}
    >
      {/* Minimal Top Bar */}
      <div className="flex items-center justify-between max-w-lg mx-auto w-full">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${wakeLockActive ? 'bg-emerald-400' : 'bg-zinc-600'
              }`}
          />
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Riding Mode
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPocketDimmed((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800/80 bg-obsidian-900 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:text-white transition"
          >
            {pocketDimmed ? (
              <Sun className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Moon className="h-3.5 w-3.5 text-zinc-400" />
            )}
            <span>{pocketDimmed ? 'Wake' : 'Dim'}</span>
          </button>

          <button
            type="button"
            onClick={onExitRidingMode}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-800/80 bg-obsidian-900 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:text-white transition"
          >
            <X className="h-3.5 w-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Center: Giant Microphone & Current Song */}
      <div className="my-auto flex flex-col items-center text-center max-w-md mx-auto w-full space-y-7">
        <button
          type="button"
          onClick={onToggleListening}
          aria-label={isListeningDesired ? 'Stop listening' : 'Start listening'}
          className={`relative flex h-36 w-36 sm:h-40 sm:w-40 items-center justify-center rounded-full transition-all duration-300 ${voiceStatus === 'listening'
              ? 'bg-emerald-500 text-obsidian-950 shadow-2xl shadow-emerald-500/30 ring-8 ring-emerald-500/15'
              : voiceStatus === 'processing'
                ? 'bg-cyan-400 text-obsidian-950 animate-pulse'
                : 'bg-obsidian-900 text-zinc-300 border border-zinc-800'
            }`}
        >
          {voiceStatus === 'listening' && !pocketDimmed && (
            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-20 pointer-events-none" />
          )}
          {isListeningDesired ? (
            <Mic className="h-14 w-14" />
          ) : (
            <MicOff className="h-14 w-14" />
          )}
        </button>

        {/* Minimal Voice Status */}
        <div className="space-y-1">
          <p className="text-base font-medium text-emerald-400">
            {voiceStatus === 'listening'
              ? liveTranscript
                ? `"${liveTranscript}"`
                : 'Listening • Say "Play [song]" or "Next"'
              : voiceStatus === 'processing'
                ? 'Processing...'
                : voiceStatus === 'success'
                  ? lastFeedback
                  : 'Tap Mic for Voice Control'}
          </p>
        </div>

        {/* Clean Song Info */}
        <div className="pt-2 space-y-1 w-full">
          <h2 className="text-2xl sm:text-3xl font-bold font-display truncate">
            {currentTrack.title}
          </h2>
          <p className="text-sm text-zinc-400 truncate">{currentTrack.artist}</p>
        </div>
      </div>

      {/* Bottom: Large Minimal Controls */}
      <div className="max-w-md mx-auto w-full space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={onPrevious}
            aria-label="Previous"
            className="flex items-center justify-center rounded-3xl border border-zinc-800/80 bg-obsidian-900 py-6 text-zinc-200 active:scale-95 transition"
          >
            <SkipBack className="h-8 w-8 fill-current" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="flex items-center justify-center rounded-3xl bg-emerald-500 py-6 text-obsidian-950 shadow-lg shadow-emerald-500/20 active:scale-95 transition"
          >
            {isPlaying ? (
              <Pause className="h-9 w-9 fill-current" />
            ) : (
              <Play className="h-9 w-9 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            aria-label="Next"
            className="flex items-center justify-center rounded-3xl border border-zinc-800/80 bg-obsidian-900 py-6 text-zinc-200 active:scale-95 transition"
          >
            <SkipForward className="h-8 w-8 fill-current" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onVolumeDown}
            className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800/60 bg-obsidian-900/70 py-3.5 text-xs font-semibold text-zinc-400 active:scale-95 transition"
          >
            <Volume1 className="h-4 w-4" />
            <span>Vol -</span>
          </button>
          <button
            type="button"
            onClick={onVolumeUp}
            className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-800/60 bg-obsidian-900/70 py-3.5 text-xs font-semibold text-zinc-400 active:scale-95 transition"
          >
            <Volume2 className="h-4 w-4" />
            <span>Vol + ({isMuted ? 'Mute' : `${volume}%`})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
