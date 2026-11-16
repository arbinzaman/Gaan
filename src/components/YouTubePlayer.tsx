import React, { useEffect, useRef, useState } from 'react';
import { Track } from '../types/music';
import { ExternalLink, RefreshCw, SkipForward } from 'lucide-react';
import { getYouTubeDesktopWatchUrl } from '../services/YouTubeService';
import { AudioService } from '../services/AudioService';

interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getVideoData: () => { video_id?: string; title?: string; author?: string };
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTPlayerInstance }) => void;
            onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
            onError?: (event: { data: number; target: YTPlayerInstance }) => void;
          };
        }
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YouTubePlayerProps {
  track: Track;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  showVideoFrame: boolean;
  seekRequest: { seconds: number; timestamp: number } | null;
  stopRequest: number;
  onPlayStateChange: (isPlaying: boolean) => void;
  onBufferingChange: (isBuffering: boolean) => void;
  onProgress: (currentTime: number, duration: number) => void;
  onEnded: () => void;
  onMetadataEnriched: (videoId: string, title: string, artist: string) => void;
  onEmbedRestricted: (failedTrack: Track, errorCode: number) => void;
  onSkipNext: () => void;
}

let apiLoadPromise: Promise<void> | null = null;

function loadYouTubeIframeAPI(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }
  if (apiLoadPromise) return apiLoadPromise;

  apiLoadPromise = new Promise<void>((resolve) => {
    const existingCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (existingCallback) existingCallback();
      resolve();
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
  });

  return apiLoadPromise;
}

function buildAudioStreamUrl(track: Track): string {
  const titleQuery = `${track.title} ${
    track.artist !== 'YouTube Music' ? track.artist : ''
  }`.trim();
  return `/api/yt-audio?id=${encodeURIComponent(
    track.youtubeId
  )}&title=${encodeURIComponent(titleQuery)}`;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  track,
  isPlaying,
  volume,
  isMuted,
  showVideoFrame,
  seekRequest,
  stopRequest,
  onPlayStateChange,
  onBufferingChange,
  onProgress,
  onEnded,
  onMetadataEnriched,
  onEmbedRestricted,
  onSkipNext,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isReadyRef = useRef<boolean>(false);
  const loadedVideoIdRef = useRef<string>(track.youtubeId);
  const usingNativeAudioRef = useRef<boolean>(true);

  const latestTrackRef = useRef<Track>(track);
  const latestIsPlayingRef = useRef<boolean>(isPlaying);
  const latestVolumeRef = useRef<number>(volume);
  const latestIsMutedRef = useRef<boolean>(isMuted);
  const onPlayStateChangeRef = useRef(onPlayStateChange);
  const onBufferingChangeRef = useRef(onBufferingChange);
  const onProgressRef = useRef(onProgress);
  const onEndedRef = useRef(onEnded);
  const onMetadataEnrichedRef = useRef(onMetadataEnriched);
  const onEmbedRestrictedRef = useRef(onEmbedRestricted);

  latestTrackRef.current = track;
  latestIsPlayingRef.current = isPlaying;
  latestVolumeRef.current = volume;
  latestIsMutedRef.current = isMuted;
  onPlayStateChangeRef.current = onPlayStateChange;
  onBufferingChangeRef.current = onBufferingChange;
  onProgressRef.current = onProgress;
  onEndedRef.current = onEnded;
  onMetadataEnrichedRef.current = onMetadataEnriched;
  onEmbedRestrictedRef.current = onEmbedRestricted;

  const [isRecovering, setIsRecovering] = useState(false);

  // Initialize YouTube IFrame Player (muted visual companion while native <audio> plays sound)
  useEffect(() => {
    let mounted = true;
    const initialVideoId = latestTrackRef.current.youtubeId;

    loadYouTubeIframeAPI().then(() => {
      if (!mounted || !containerRef.current || !window.YT) return;

      const playerDiv = document.createElement('div');
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(playerDiv);

      playerRef.current = new window.YT.Player(playerDiv, {
        width: '100%',
        height: '100%',
        videoId: initialVideoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            if (!mounted) return;
            isReadyRef.current = true;

            try {
              event.target.setVolume?.(latestVolumeRef.current);
              if (usingNativeAudioRef.current || latestIsMutedRef.current) {
                event.target.mute?.();
              } else {
                event.target.unMute?.();
              }
            } catch {
              // Ignore
            }

            const desiredVideoId = latestTrackRef.current.youtubeId;
            if (desiredVideoId !== initialVideoId) {
              loadedVideoIdRef.current = desiredVideoId;
              event.target.cueVideoById?.(desiredVideoId, 0);
            }
          },
          onStateChange: (event) => {
            if (!mounted) return;
            const state = event.data;

            if (state === 1) {
              try {
                const vData = event.target.getVideoData?.();
                if (vData && vData.video_id && vData.title) {
                  onMetadataEnrichedRef.current(
                    vData.video_id,
                    vData.title,
                    vData.author || 'YouTube Music'
                  );
                }
              } catch {
                // Ignore
              }
            }

            // When native HTML5 <audio> is active, ignore iframe pause/play events
            // so leaving Safari never stops music!
            if (usingNativeAudioRef.current) {
              try {
                event.target.mute?.();
              } catch {
                // Ignore
              }
              return;
            }

            if (state === 1) {
              setIsRecovering(false);
              onBufferingChangeRef.current(false);
              onPlayStateChangeRef.current(true);
              const dur = event.target.getDuration?.() || 0;
              const cur = event.target.getCurrentTime?.() || 0;
              onProgressRef.current(cur, dur);
            } else if (state === 2) {
              onBufferingChangeRef.current(false);
              onPlayStateChangeRef.current(false);
            } else if (state === 3) {
              onBufferingChangeRef.current(true);
            } else if (state === 0) {
              onBufferingChangeRef.current(false);
              onEndedRef.current();
            }
          },
          onError: (event) => {
            if (!mounted) return;
            if (usingNativeAudioRef.current) return;
            const code = event.data;
            onBufferingChangeRef.current(false);
            setIsRecovering(true);
            onEmbedRestrictedRef.current(latestTrackRef.current, code);
          },
        },
      });
    });

    return () => {
      mounted = false;
      isReadyRef.current = false;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore
        }
        playerRef.current = null;
      }
    };
  }, []);

  // Register native <audio> element with AudioService for synchronous iOS gesture unlock
  useEffect(() => {
    AudioService.registerAudioElement(audioRef.current);
    return () => {
      AudioService.registerAudioElement(null);
    };
  }, []);

  // Load new track into native <audio> element (and cue YouTube iframe)
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    usingNativeAudioRef.current = true;
    setIsRecovering(false);

    const streamUrl = buildAudioStreamUrl(track);
    if (audioEl.getAttribute('data-video-id') !== track.youtubeId) {
      audioEl.setAttribute('data-video-id', track.youtubeId);
      audioEl.src = streamUrl;
      audioEl.load();
    }

    if (isPlaying) {
      onBufferingChangeRef.current(true);
      audioEl.play().catch(() => {});
    }

    if (
      isReadyRef.current &&
      playerRef.current &&
      loadedVideoIdRef.current !== track.youtubeId
    ) {
      loadedVideoIdRef.current = track.youtubeId;
      try {
        playerRef.current.mute?.();
        playerRef.current.cueVideoById?.(track.youtubeId, 0);
      } catch {
        // Ignore
      }
    }
  }, [track]);

  // Sync play / pause state with native <audio> (or YouTube iframe fallback)
  useEffect(() => {
    const audioEl = audioRef.current;

    if (usingNativeAudioRef.current && audioEl) {
      if (isPlaying) {
        if (audioEl.paused) {
          audioEl.play().catch(() => {});
        }
      } else {
        if (!audioEl.paused) {
          audioEl.pause();
        }
      }

      // IMPORTANT for iPhone Safari background playback:
      // Keep the YouTube <iframe> paused while native <audio> is playing,
      // otherwise the cross-origin <iframe> hijacks iOS AVAudioSession and stops
      // playback the moment you leave Safari or lock the screen.
      if (isReadyRef.current && playerRef.current) {
        try {
          playerRef.current.mute?.();
          playerRef.current.pauseVideo?.();
        } catch {
          // Ignore
        }
      }
      return;
    }

    if (!isReadyRef.current || !playerRef.current) return;
    try {
      const state = playerRef.current.getPlayerState?.();
      if (isPlaying && state !== 1 && state !== 3) {
        playerRef.current.playVideo();
      } else if (!isPlaying && state === 1) {
        playerRef.current.pauseVideo();
      }
    } catch {
      // Ignore
    }
  }, [isPlaying]);

  // Handle explicit stop command
  useEffect(() => {
    if (!stopRequest) return;
    const audioEl = audioRef.current;
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
    }
    if (isReadyRef.current && playerRef.current) {
      try {
        playerRef.current.stopVideo();
      } catch {
        // Ignore
      }
    }
    onPlayStateChangeRef.current(false);
    onProgressRef.current(0, audioEl?.duration || 0);
  }, [stopRequest]);

  // Sync volume and mute
  useEffect(() => {
    const clampedVol = Math.max(0, Math.min(100, volume));
    const audioEl = audioRef.current;
    if (audioEl) {
      audioEl.volume = clampedVol / 100;
      audioEl.muted = isMuted || clampedVol === 0;
    }

    if (!isReadyRef.current || !playerRef.current) return;
    try {
      playerRef.current.setVolume?.(clampedVol);
      if (usingNativeAudioRef.current || isMuted || clampedVol === 0) {
        playerRef.current.mute?.();
      } else {
        playerRef.current.unMute?.();
      }
    } catch {
      // Ignore
    }
  }, [volume, isMuted]);

  // Handle seek requests
  useEffect(() => {
    if (!seekRequest) return;
    const audioEl = audioRef.current;
    if (usingNativeAudioRef.current && audioEl) {
      try {
        audioEl.currentTime = seekRequest.seconds;
        onProgressRef.current(seekRequest.seconds, audioEl.duration || 0);
      } catch {
        // Ignore
      }
    }
    if (isReadyRef.current && playerRef.current) {
      try {
        playerRef.current.seekTo(seekRequest.seconds, true);
      } catch {
        // Ignore
      }
    }
  }, [seekRequest]);

  // Poll YouTube IFrame progress only when in fallback mode
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (usingNativeAudioRef.current) return;
      if (!isReadyRef.current || !playerRef.current) return;
      try {
        const state = playerRef.current.getPlayerState?.();
        if (state === 1) {
          const cur = playerRef.current.getCurrentTime?.() || 0;
          const dur = playerRef.current.getDuration?.() || 0;
          onProgressRef.current(cur, dur);
        }
      } catch {
        // Ignore
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto max-w-md w-full">
      {/* Native HTML5 Audio Element for iPhone Safari Background & Lock Screen Playback */}
      <audio
        ref={audioRef}
        playsInline
        preload="auto"
        onPlay={() => {
          onBufferingChangeRef.current(false);
          onPlayStateChangeRef.current(true);
        }}
        onPlaying={() => {
          setIsRecovering(false);
          onBufferingChangeRef.current(false);
          onPlayStateChangeRef.current(true);
        }}
        onPause={() => {
          const el = audioRef.current;
          if (el && !el.ended && usingNativeAudioRef.current) {
            onPlayStateChangeRef.current(false);
          }
        }}
        onWaiting={() => {
          if (usingNativeAudioRef.current) {
            onBufferingChangeRef.current(true);
          }
        }}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (el && usingNativeAudioRef.current) {
            onProgressRef.current(
              el.currentTime,
              Number.isFinite(el.duration) ? el.duration : 0
            );
          }
        }}
        onEnded={() => {
          if (usingNativeAudioRef.current) {
            onBufferingChangeRef.current(false);
            onEndedRef.current();
          }
        }}
        onError={() => {
          // Only fall back to iframe if we haven't already loaded a real stream error
          const el = audioRef.current;
          if (!el || !el.src) return;
          usingNativeAudioRef.current = false;
          if (isReadyRef.current && playerRef.current) {
            try {
              if (!latestIsMutedRef.current && latestVolumeRef.current > 0) {
                playerRef.current.unMute?.();
              }
              if (latestIsPlayingRef.current) {
                playerRef.current.loadVideoById(
                  latestTrackRef.current.youtubeId,
                  0
                );
                playerRef.current.playVideo();
              }
            } catch {
              // Ignore
            }
          }
        }}
        className="fixed -top-10 left-0 w-1 h-1 opacity-0 pointer-events-none"
      />

      {isRecovering && (
        <div className="mb-2 rounded-2xl border border-zinc-800 bg-obsidian-900/90 px-3.5 py-2.5 text-xs text-zinc-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <RefreshCw className="h-3.5 w-3.5 text-emerald-400 animate-spin shrink-0" />
            <span className="truncate">
              Switching to playable audio stream for &ldquo;{track.title}&rdquo;...
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={getYouTubeDesktopWatchUrl(track.youtubeId, track.playlistId)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
            >
              <ExternalLink className="h-3 w-3 inline mr-1" />
              YT
            </a>
            <button
              type="button"
              onClick={onSkipNext}
              className="rounded-lg bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
            >
              <SkipForward className="h-3 w-3 inline" />
            </button>
          </div>
        </div>
      )}

      <div
        className={
          showVideoFrame
            ? 'relative w-full aspect-video rounded-3xl overflow-hidden border border-zinc-800/70 bg-black shadow-xl'
            : 'fixed -left-[9999px] -top-[9999px] w-[220px] h-[124px] opacity-0 pointer-events-none overflow-hidden'
        }
        aria-hidden={!showVideoFrame}
      >
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
};
