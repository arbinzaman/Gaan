import React, { useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Repeat1,
  Shuffle,
  Heart,
  ExternalLink,
  Tv,
  ListMusic,
} from 'lucide-react';
import { RepeatMode, Track, UserPreferences, VoiceStatus } from '../types/music';
import { getYouTubeDesktopWatchUrl } from '../services/YouTubeService';

interface MusicPlayerProps {
  currentTrack: Track;
  queue: Track[];
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  isFavorite: boolean;
  preferences: UserPreferences;
  voiceStatus: VoiceStatus;
  isListeningDesired: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onCycleRepeat: () => void;
  onToggleShuffle: () => void;
  onToggleFavorite: (trackId: string) => void;
  onToggleVideoFrame: () => void;
  onEnterRidingMode: () => void;
  onToggleVoiceListening: () => void;
  onSelectTrack: (track: Track) => void;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  currentTrack,
  queue,
  isPlaying,
  isBuffering,
  currentTime,
  duration,
  volume,
  isMuted,
  repeatMode,
  isShuffle,
  isFavorite,
  preferences,
  onTogglePlay,
  onNext,
  onPrevious,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onCycleRepeat,
  onToggleShuffle,
  onToggleFavorite,
  onToggleVideoFrame,
  onSelectTrack,
}) => {
  const [showQueue, setShowQueue] = useState(false);

  const effectiveDuration = duration > 0 ? duration : 210;
  const progressPercent = Math.min(
    100,
    Math.max(0, (currentTime / effectiveDuration) * 100)
  );

  return (
    <div className="mx-auto max-w-md w-full space-y-4">
      <div className="rounded-3xl border border-zinc-800/60 bg-obsidian-900/60 backdrop-blur-xl p-5 shadow-2xl">
        {/* Show square cover art only when the video player frame is docked */}
        {!preferences.showVideoFrame && (
          <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-obsidian-950 shadow-xl mb-5">
            <img
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              className={`h-full w-full object-cover transition-transform duration-700 ${
                isPlaying ? 'scale-[1.02]' : 'scale-100 opacity-90'
              }`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          </div>
        )}

        {/* Title, Artist & Quick Actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {preferences.showVideoFrame && (
              <img
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                className="h-11 w-11 rounded-xl object-cover shrink-0 bg-zinc-900"
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-bold font-display text-white truncate">
                {currentTrack.title}
              </h1>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {isBuffering ? 'Loading stream...' : currentTrack.artist}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleVideoFrame}
              title={preferences.showVideoFrame ? 'Dock Video' : 'Expand Video'}
              className={`p-2 rounded-full transition ${
                preferences.showVideoFrame
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Tv className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => onToggleFavorite(currentTrack.id)}
              aria-label={isFavorite ? 'Remove favorite' : 'Favorite'}
              className={`p-2 rounded-full transition ${
                isFavorite
                  ? 'text-rose-400 bg-rose-500/10'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setShowQueue((prev) => !prev)}
              aria-label="Toggle queue"
              title="Up Next Queue"
              className={`p-2 rounded-full transition ${
                showQueue
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <ListMusic className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Minimal Seek Bar */}
        <div className="mt-5">
          <input
            type="range"
            min={0}
            max={effectiveDuration}
            step={1}
            value={Math.min(currentTime, effectiveDuration)}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Seek playback"
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-zinc-800 accent-emerald-400"
            style={{
              background: `linear-gradient(to right, var(--theme-hex) ${progressPercent}%, #27272a ${progressPercent}%)`,
            }}
          />
          <div className="mt-1.5 flex justify-between text-[11px] font-medium text-zinc-500">
            <span>{formatTime(currentTime)}</span>
            <span>{duration > 0 ? formatTime(duration) : 'Stream'}</span>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="mt-4 flex items-center justify-between px-2">
          <button
            type="button"
            onClick={onToggleShuffle}
            aria-label="Shuffle"
            className={`p-2.5 rounded-full transition ${
              isShuffle
                ? 'text-emerald-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Shuffle className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={onPrevious}
              aria-label="Previous"
              className="p-2.5 text-zinc-200 hover:text-white transition active:scale-95"
            >
              <SkipBack className="h-6 w-6 fill-current" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-obsidian-950 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 transition active:scale-95"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6 fill-current" />
              ) : (
                <Play className="h-6 w-6 fill-current ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              aria-label="Next"
              className="p-2.5 text-zinc-200 hover:text-white transition active:scale-95"
            >
              <SkipForward className="h-6 w-6 fill-current" />
            </button>
          </div>

          <button
            type="button"
            onClick={onCycleRepeat}
            aria-label="Repeat"
            className={`p-2.5 rounded-full transition ${
              repeatMode !== 'off'
                ? 'text-emerald-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="h-4 w-4" />
            ) : (
              <Repeat className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Minimal Volume & YouTube Desktop Link */}
        <div className="mt-5 pt-4 border-t border-zinc-800/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-1">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              className="text-zinc-400 hover:text-zinc-200 transition"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4 text-rose-400" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              aria-label="Volume"
              className="w-full max-w-[140px] h-1 rounded-lg appearance-none cursor-pointer bg-zinc-800 accent-zinc-300"
            />
          </div>

          <a
            href={getYouTubeDesktopWatchUrl(
              currentTrack.youtubeId,
              currentTrack.playlistId
            )}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in YouTube Desktop Mode"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-200 transition"
          >
            <span>YT Desktop</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Collapsible Clean Up Next Queue */}
      {showQueue && (
        <div className="rounded-3xl border border-zinc-800/60 bg-obsidian-900/60 backdrop-blur-xl p-4 space-y-2">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-xs font-semibold text-zinc-400">
              Queue ({queue.length})
            </span>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
            {queue.map((item) => {
              const active = item.youtubeId === currentTrack.youtubeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTrack(item)}
                  className={`w-full flex items-center gap-3 rounded-xl p-2 text-left transition ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'hover:bg-zinc-800/50 text-zinc-200'
                  }`}
                >
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="h-9 w-9 rounded-lg object-cover shrink-0 bg-zinc-900"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{item.title}</p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {item.artist}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
