import React from 'react';
import {
  Volume2,
  ExternalLink,
  RotateCcw,
  Palette,
} from 'lucide-react';
import {
  BrowserCapabilities,
  ThemePreset,
  Track,
  UserPreferences,
  VoiceLanguage,
} from '../types/music';
import {
  getYouTubeDesktopWatchUrl,
  getYouTubeMusicWatchUrl,
} from '../services/YouTubeService';
import { SpeechFeedbackService } from '../services/SpeechFeedbackService';

interface SettingsProps {
  preferences: UserPreferences;
  capabilities: BrowserCapabilities;
  currentTrack: Track;
  onUpdatePreferences: (partial: Partial<UserPreferences>) => void;
  onResetPreferences: () => void;
}

const THEME_OPTIONS: Array<{
  id: ThemePreset;
  label: string;
  bgPreview: string;
  accentPreview: string;
}> = [
  {
    id: 'emerald',
    label: 'Obsidian Dark',
    bgPreview: '#080d0b',
    accentPreview: '#10b981',
  },
  {
    id: 'light',
    label: 'Frost Light',
    bgPreview: '#f1f5f9',
    accentPreview: '#10b981',
  },
  {
    id: 'ocean',
    label: 'Ocean Navy',
    bgPreview: '#0a192f',
    accentPreview: '#0ea5e9',
  },
  {
    id: 'violet',
    label: 'Royal Purple',
    bgPreview: '#180e30',
    accentPreview: '#a855f7',
  },
  {
    id: 'rose',
    label: 'Crimson Velvet',
    bgPreview: '#260a14',
    accentPreview: '#f43f5e',
  },
  {
    id: 'amber',
    label: 'Warm Mocha',
    bgPreview: '#21160c',
    accentPreview: '#f59e0b',
  },
];

export const Settings: React.FC<SettingsProps> = ({
  preferences,
  capabilities,
  currentTrack,
  onUpdatePreferences,
  onResetPreferences,
}) => {
  return (
    <div className="mx-auto max-w-md w-full space-y-4">
      {/* Full UI Theme Picker in Settings */}
      <div className="rounded-3xl border border-zinc-800/60 bg-obsidian-900/80 p-5 space-y-3.5">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-white">App Theme</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {THEME_OPTIONS.map((t) => {
            const active = preferences.theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onUpdatePreferences({ theme: t.id })}
                className={`flex items-center gap-2.5 rounded-2xl border p-2.5 text-xs font-semibold transition ${
                  active
                    ? 'border-emerald-500 bg-emerald-500/15 text-white ring-2 ring-emerald-500/30'
                    : 'border-zinc-800 bg-obsidian-950/80 text-zinc-400 hover:text-white'
                }`}
              >
                <span
                  className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 shadow-inner"
                  style={{ backgroundColor: t.bgPreview }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: t.accentPreview }}
                  />
                </span>
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Voice Preferences */}
      <div className="rounded-3xl border border-zinc-800/60 bg-obsidian-900/80 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Voice Control</h2>
          <button
            type="button"
            onClick={onResetPreferences}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Wake Phrase
            </label>
            <input
              type="text"
              value={preferences.wakePhrase}
              onChange={(e) =>
                onUpdatePreferences({ wakePhrase: e.target.value || 'Hey Gaan' })
              }
              className="w-full rounded-xl border border-zinc-800 bg-obsidian-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1">
              Language
            </label>
            <select
              value="en-IN"
              onChange={() =>
                onUpdatePreferences({
                  voiceLanguage: 'en-IN',
                })
              }
              className="w-full rounded-xl border border-zinc-800 bg-obsidian-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="en-IN">English (India — en-IN)</option>
            </select>
          </div>
        </div>

        <div className="divide-y divide-zinc-800/50 text-xs">
          <label className="flex items-center justify-between py-2.5 cursor-pointer">
            <div>
              <p className="font-medium text-zinc-200">Spoken Voice Feedback (TTS)</p>
              <p className="text-[11px] text-zinc-500">
                Confirm commands aloud in your headset
              </p>
            </div>
            <input
              type="checkbox"
              checked={preferences.voiceFeedback}
              onChange={(e) =>
                onUpdatePreferences({ voiceFeedback: e.target.checked })
              }
              className="h-4 w-4 rounded accent-emerald-500"
            />
          </label>

          <label className="flex items-center justify-between py-2.5 cursor-pointer">
            <div>
              <p className="font-medium text-zinc-200">Require Wake Phrase</p>
              <p className="text-[11px] text-zinc-500">
                Off allows direct commands like &ldquo;next song&rdquo; or &ldquo;pause&rdquo;
              </p>
            </div>
            <input
              type="checkbox"
              checked={preferences.requireWakePhrase}
              onChange={(e) =>
                onUpdatePreferences({ requireWakePhrase: e.target.checked })
              }
              className="h-4 w-4 rounded accent-emerald-500"
            />
          </label>

          <label className="flex items-center justify-between py-2.5 cursor-pointer">
            <div>
              <p className="font-medium text-zinc-200">Riding Mode Screen Wake Lock</p>
              <p className="text-[11px] text-zinc-500">
                Keep screen awake so Safari keeps microphone active
              </p>
            </div>
            <input
              type="checkbox"
              checked={preferences.ridingModeWakeLock}
              onChange={(e) =>
                onUpdatePreferences({ ridingModeWakeLock: e.target.checked })
              }
              className="h-4 w-4 rounded accent-emerald-500"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() =>
            SpeechFeedbackService.speak(
              'Voice feedback is ready. Say play Believer, or next song.',
              true,
              preferences.voiceLanguage
            )
          }
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-obsidian-950 hover:bg-emerald-400 transition"
        >
          <Volume2 className="h-3.5 w-3.5" />
          <span>Test Text-to-Speech Voice</span>
        </button>
      </div>

      {/* YouTube Desktop Site Mode */}
      <div className="rounded-3xl border border-zinc-800/60 bg-obsidian-900/80 p-5 space-y-3">
        <h2 className="text-sm font-bold text-white">YouTube Desktop Mode</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          On iPhone Safari, if iOS pauses embedded video when locking the screen, press Play on the Lock Screen or open in Safari&apos;s <strong>Request Desktop Website</strong> mode.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a
            href={getYouTubeDesktopWatchUrl(
              currentTrack.youtubeId,
              currentTrack.playlistId
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-obsidian-950 hover:bg-emerald-400 transition"
          >
            <span>Open YouTube Desktop</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href={getYouTubeMusicWatchUrl(
              currentTrack.youtubeId,
              currentTrack.playlistId
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-obsidian-950 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:text-white transition"
          >
            <span>Open YT Music</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-800/60 bg-obsidian-900/80 p-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
        <span>
          Voice API: {capabilities.speechRecognitionSupported ? 'Ready' : 'Fallback'}
        </span>
        <span>
          Media Session: {capabilities.mediaSessionSupported ? 'Active' : 'N/A'}
        </span>
        <span>
          Wake Lock: {capabilities.wakeLockSupported ? 'Supported' : 'Manual'}
        </span>
      </div>
    </div>
  );
};
