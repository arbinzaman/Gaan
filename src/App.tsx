import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Disc3,
  Navigation,
  Search,
  Library,
  Settings as SettingsIcon,
  Play,
  Pause,
  SkipForward,
} from 'lucide-react';
import {
  NavigationTab,
  ParsedVoiceCommand,
  Playlist,
  RepeatMode,
  Track,
  UserPreferences,
  VoiceLogEntry,
  VoiceStatus,
} from './types/music';
import {
  DEFAULT_PREFERENCES,
  StorageService,
} from './services/StorageService';
import { detectBrowserCapabilities } from './services/BrowserCapabilityDetector';
import {
  searchLocalCatalog,
  searchYouTubeOnline,
} from './services/YouTubeService';
import { MediaSessionManager } from './services/MediaSessionManager';
import {
  SpeechFeedbackService,
  WakeLockController,
} from './services/SpeechFeedbackService';
import { AudioService } from './services/AudioService';
import { YouTubePlayer } from './components/YouTubePlayer';
import { VoiceAssistant } from './components/VoiceAssistant';
import { MusicPlayer } from './components/MusicPlayer';
import { RidingMode } from './components/RidingMode';
import { SearchPage } from './components/SearchPage';
import { PlaylistManager } from './components/PlaylistManager';
import { Settings } from './components/Settings';

export const App: React.FC = () => {
  const [preferences, setPreferences] = useState<UserPreferences>(() =>
    StorageService.getPreferences()
  );
  const [libraryTracks, setLibraryTracks] = useState<Track[]>(() =>
    StorageService.getLibraryTracks()
  );
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() =>
    StorageService.getFavoriteIds()
  );
  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    StorageService.getPlaylists()
  );
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>(() =>
    StorageService.getRecentlyPlayed()
  );
  const [currentTrack, setCurrentTrack] = useState<Track>(() =>
    StorageService.getLastPlayed()
  );
  const [queue, setQueue] = useState<Track[]>(() =>
    StorageService.getLibraryTracks()
  );

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [seekRequest, setSeekRequest] = useState<{
    seconds: number;
    timestamp: number;
  } | null>(null);
  const [stopRequest, setStopRequest] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<NavigationTab>(() =>
    StorageService.getRidingMode() ? 'riding' : 'player'
  );
  const [pendingSearchQuery, setPendingSearchQuery] = useState<string>('');

  const [isListeningDesired, setIsListeningDesired] = useState<boolean>(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [lastFeedback, setLastFeedback] = useState<string>('');
  const [voiceLogs, setVoiceLogs] = useState<VoiceLogEntry[]>([]);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  const currentTimeRef = useRef<number>(0);
  currentTimeRef.current = currentTime;

  const blockedVideoIdsRef = useRef<Set<string>>(new Set());

  const capabilities = useMemo(() => detectBrowserCapabilities(), []);
  const wakeLockRef = useRef<WakeLockController | null>(null);

  // Apply dynamic theme color attribute to <html> and <body>
  useEffect(() => {
    const themeName = preferences.theme || 'emerald';
    document.documentElement.setAttribute('data-theme', themeName);
    document.body.setAttribute('data-theme', themeName);
  }, [preferences.theme]);

  // Keep top-level HTML5 <audio> background carrier active while playing
  useEffect(() => {
    AudioService.setBackgroundKeepAlive(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    wakeLockRef.current = new WakeLockController((active) => {
      setWakeLockActive(active);
    });
    return () => {
      wakeLockRef.current?.release();
    };
  }, []);

  useEffect(() => {
    const isRiding = activeTab === 'riding';
    StorageService.saveRidingMode(isRiding);

    if (isRiding && preferences.ridingModeWakeLock) {
      wakeLockRef.current?.request();
    } else {
      wakeLockRef.current?.release();
    }

    const handleVis = () => {
      if (
        document.visibilityState === 'visible' &&
        activeTab === 'riding' &&
        preferences.ridingModeWakeLock
      ) {
        wakeLockRef.current?.request();
      }
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, [activeTab, preferences.ridingModeWakeLock]);

  const updatePreferences = useCallback((partial: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const updated = { ...prev, ...partial };
      StorageService.savePreferences(updated);
      return updated;
    });
  }, []);

  const handleAddVoiceLog = useCallback((entry: VoiceLogEntry) => {
    setVoiceLogs((prev) => [entry, ...prev].slice(0, 20));
  }, []);

  const handleSelectTrack = useCallback((track: Track, autoPlay = true) => {
    setCurrentTrack(track);
    setCurrentTime(0);
    if (autoPlay) {
      AudioService.triggerPlayGesture();
      setIsPlaying(true);
    }
    const updatedRecent = StorageService.addRecentlyPlayed(track);
    setRecentlyPlayed(updatedRecent);
  }, []);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        AudioService.triggerPlayGesture();
      } else {
        AudioService.triggerPauseGesture();
      }
      return next;
    });
  }, []);

  const handlePlayQueue = useCallback(
    (tracks: Track[], startIndex = 0) => {
      if (tracks.length === 0) return;
      setQueue(tracks);
      const target = tracks[startIndex] || tracks[0];
      handleSelectTrack(target, true);
    },
    [handleSelectTrack]
  );

  const handleNextTrack = useCallback(() => {
    const activeList = queue.length > 0 ? queue : libraryTracks;
    if (activeList.length === 0) return;

    if (preferences.isShuffle && activeList.length > 1) {
      const candidates = activeList.filter(
        (t) => t.youtubeId !== currentTrack.youtubeId
      );
      const randomTrack =
        candidates[Math.floor(Math.random() * candidates.length)] || activeList[0];
      handleSelectTrack(randomTrack, true);
      return;
    }

    const currentIndex = activeList.findIndex(
      (t) => t.youtubeId === currentTrack.youtubeId
    );
    const nextIndex =
      currentIndex >= 0 ? (currentIndex + 1) % activeList.length : 0;
    handleSelectTrack(activeList[nextIndex], true);
  }, [currentTrack.youtubeId, handleSelectTrack, libraryTracks, preferences.isShuffle, queue]);

  const handlePreviousTrack = useCallback(() => {
    if (currentTimeRef.current > 5) {
      setSeekRequest({ seconds: 0, timestamp: Date.now() });
      setCurrentTime(0);
      return;
    }

    const activeList = queue.length > 0 ? queue : libraryTracks;
    if (activeList.length === 0) return;
    const currentIndex = activeList.findIndex(
      (t) => t.youtubeId === currentTrack.youtubeId
    );
    const prevIndex =
      currentIndex > 0 ? currentIndex - 1 : activeList.length - 1;
    handleSelectTrack(activeList[prevIndex], true);
  }, [currentTrack.youtubeId, handleSelectTrack, libraryTracks, queue]);

  const handleTrackEnded = useCallback(() => {
    if (preferences.repeatMode === 'one') {
      setSeekRequest({ seconds: 0, timestamp: Date.now() });
      setIsPlaying(true);
      return;
    }

    const activeList = queue.length > 0 ? queue : libraryTracks;
    const currentIndex = activeList.findIndex(
      (t) => t.youtubeId === currentTrack.youtubeId
    );
    const isLast = currentIndex === activeList.length - 1;

    if (isLast && preferences.repeatMode === 'off' && !preferences.isShuffle) {
      setIsPlaying(false);
      return;
    }

    handleNextTrack();
  }, [
    currentTrack.youtubeId,
    handleNextTrack,
    libraryTracks,
    preferences.isShuffle,
    preferences.repeatMode,
    queue,
  ]);

  const handleStopPlayback = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setStopRequest(Date.now());
  }, []);

  const handleVolumeChange = useCallback(
    (newVal: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(newVal)));
      updatePreferences({
        volume: clamped,
        isMuted: clamped === 0 ? true : false,
      });
    },
    [updatePreferences]
  );

  const handleToggleFavorite = useCallback((trackId: string) => {
    const res = StorageService.toggleFavorite(trackId);
    setFavoriteIds(res.favoriteIds);
    return res.isFavorite;
  }, []);

  const handleAddTrackToLibrary = useCallback((track: Track) => {
    const updated = StorageService.addTrackToLibrary(track);
    setLibraryTracks(updated);
    setQueue((prev) => {
      const exists = prev.some((t) => t.youtubeId === track.youtubeId);
      return exists ? prev : [track, ...prev];
    });
  }, []);

  const handleRemoveTrackFromLibrary = useCallback((trackId: string) => {
    const updated = StorageService.removeTrackFromLibrary(trackId);
    setLibraryTracks(updated);
  }, []);

  const handleMetadataEnriched = useCallback(
    (videoId: string, title: string, artist: string) => {
      setCurrentTrack((prev) => {
        if (prev.youtubeId !== videoId) return prev;
        if (!prev.title.startsWith('YouTube Track (')) return prev;
        const enriched: Track = {
          ...prev,
          title,
          artist: artist || prev.artist,
        };
        StorageService.addTrackToLibrary(enriched);
        setLibraryTracks(StorageService.getLibraryTracks());
        return enriched;
      });
    },
    []
  );

  const handleEmbedRestricted = useCallback(
    async (failedTrack: Track) => {
      blockedVideoIdsRef.current.add(failedTrack.youtubeId);
      const searchStr = `${failedTrack.title} ${
        failedTrack.artist !== 'YouTube Music' ? failedTrack.artist : ''
      }`.trim();

      const results = await searchYouTubeOnline(
        searchStr,
        preferences.youtubeApiKey,
        true
      );

      const candidate = results.find(
        (item) => !blockedVideoIdsRef.current.has(item.youtubeId)
      );

      if (candidate) {
        const updatedTrack: Track = {
          ...failedTrack,
          youtubeId: candidate.youtubeId,
          thumbnail: candidate.thumbnail || failedTrack.thumbnail,
        };
        const updatedLib = StorageService.addTrackToLibrary(updatedTrack);
        setLibraryTracks(updatedLib);
        setQueue((prev) =>
          prev.map((t) => (t.id === failedTrack.id ? updatedTrack : t))
        );
        setCurrentTrack(updatedTrack);
        setIsPlaying(true);
      } else {
        setLastFeedback(
          `Unable to embed "${failedTrack.title}" — tap YT Desktop to play on YouTube.`
        );
      }
    },
    [preferences.youtubeApiKey]
  );

  const handleCreatePlaylist = useCallback(
    (name: string, description: string) => {
      const newPl: Playlist = {
        id: `custom-pl-${Date.now()}`,
        name,
        description,
        trackIds: [currentTrack.id],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const updated = [newPl, ...playlists];
      setPlaylists(updated);
      StorageService.savePlaylists(updated);
    },
    [currentTrack.id, playlists]
  );

  const handleImportYouTubePlaylist = useCallback(
    (title: string, importedTracks: Track[]) => {
      if (importedTracks.length === 0) return;

      // Merge all imported tracks into local library
      const currentLib = StorageService.getLibraryTracks();
      const existingById = new Map<string, Track>();
      for (const item of currentLib) {
        existingById.set(item.id, item);
      }
      for (const item of importedTracks) {
        existingById.set(item.id, item);
      }
      const mergedLib = Array.from(existingById.values());
      StorageService.saveLibraryTracks(mergedLib);
      setLibraryTracks(mergedLib);

      const newPl: Playlist = {
        id: `yt-pl-${Date.now()}`,
        name: title,
        description: `YouTube Mix • ${importedTracks.length} tracks`,
        trackIds: importedTracks.map((t) => t.id),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const updatedPlaylists = [newPl, ...playlists];
      setPlaylists(updatedPlaylists);
      StorageService.savePlaylists(updatedPlaylists);

      // Start playing the imported playlist immediately
      setQueue(importedTracks);
      handleSelectTrack(importedTracks[0], true);
    },
    [handleSelectTrack, playlists]
  );

  const handleDeletePlaylist = useCallback(
    (playlistId: string) => {
      const updated = playlists.filter((p) => p.id !== playlistId);
      setPlaylists(updated);
      StorageService.savePlaylists(updated);
    },
    [playlists]
  );

  const handleAddTrackToPlaylist = useCallback(
    (playlistId: string, track: Track) => {
      handleAddTrackToLibrary(track);
      const updated = playlists.map((p) => {
        if (p.id !== playlistId) return p;
        if (p.trackIds.includes(track.id)) return p;
        return {
          ...p,
          trackIds: [...p.trackIds, track.id],
          updatedAt: Date.now(),
        };
      });
      setPlaylists(updated);
      StorageService.savePlaylists(updated);
    },
    [handleAddTrackToLibrary, playlists]
  );

  const handleRemoveTrackFromPlaylist = useCallback(
    (playlistId: string, trackId: string) => {
      const updated = playlists.map((p) => {
        if (p.id !== playlistId) return p;
        return {
          ...p,
          trackIds: p.trackIds.filter((id) => id !== trackId),
          updatedAt: Date.now(),
        };
      });
      setPlaylists(updated);
      StorageService.savePlaylists(updated);
    },
    [playlists]
  );

  useEffect(() => {
    MediaSessionManager.updateMetadata(currentTrack);
  }, [currentTrack]);

  useEffect(() => {
    MediaSessionManager.updatePlaybackState(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    MediaSessionManager.updatePositionState(currentTime, duration);
  }, [currentTime, duration]);

  useEffect(() => {
    return MediaSessionManager.registerHandlers({
      onPlay: () => setIsPlaying(true),
      onPause: () => setIsPlaying(false),
      onStop: () => handleStopPlayback(),
      onNextTrack: () => handleNextTrack(),
      onPreviousTrack: () => handlePreviousTrack(),
      onSeekTo: (seconds) =>
        setSeekRequest({ seconds, timestamp: Date.now() }),
      onSeekBy: (delta) =>
        setSeekRequest({
          seconds: Math.max(0, currentTimeRef.current + delta),
          timestamp: Date.now(),
        }),
    });
  }, [handleNextTrack, handlePreviousTrack, handleStopPlayback]);

  const handleVoiceCommand = useCallback(
    async (
      cmd: ParsedVoiceCommand
    ): Promise<{ success: boolean; feedback: string }> => {
      const speak = (msg: string) => {
        SpeechFeedbackService.speak(
          msg,
          preferences.voiceFeedback,
          preferences.voiceLanguage
        );
      };

      switch (cmd.action) {
        case 'PLAY_QUERY': {
          const q = (cmd.query || '').trim();
          if (!q) {
            setIsPlaying(true);
            const msg = `Playing ${currentTrack.title}`;
            speak(msg);
            return { success: true, feedback: msg };
          }

          const matches = searchLocalCatalog(q, libraryTracks);
          if (matches.length > 0) {
            const top = matches[0];
            handleSelectTrack(top, true);
            const msg = `Playing ${top.title}`;
            speak(msg);
            return { success: true, feedback: msg };
          }

          const onlineMatches = await searchYouTubeOnline(
            q,
            preferences.youtubeApiKey,
            true
          );
          if (onlineMatches.length > 0) {
            const topOnline = onlineMatches[0];
            handleAddTrackToLibrary(topOnline);
            handleSelectTrack(topOnline, true);
            const msg = `Playing ${topOnline.title}`;
            speak(msg);
            return { success: true, feedback: msg };
          }

          setPendingSearchQuery(q);
          if (activeTab !== 'riding') {
            setActiveTab('search');
          }
          const notFoundMsg = `Opened search for "${q}"`;
          speak(`Search opened for ${q}`);
          return { success: true, feedback: notFoundMsg };
        }

        case 'NEXT_TRACK': {
          handleNextTrack();
          speak('Next song');
          return { success: true, feedback: 'Next track' };
        }

        case 'PREVIOUS_TRACK': {
          handlePreviousTrack();
          speak('Previous song');
          return { success: true, feedback: 'Previous track' };
        }

        case 'PAUSE': {
          setIsPlaying(false);
          speak('Paused');
          return { success: true, feedback: 'Paused' };
        }

        case 'RESUME': {
          setIsPlaying(true);
          speak('Playing');
          return { success: true, feedback: `Playing ${currentTrack.title}` };
        }

        case 'STOP': {
          handleStopPlayback();
          speak('Music stopped');
          return { success: true, feedback: 'Stopped' };
        }

        case 'VOLUME_UP': {
          const nextVol = Math.min(
            100,
            (preferences.isMuted ? 0 : preferences.volume) + 15
          );
          handleVolumeChange(nextVol);
          speak(`Volume ${nextVol}`);
          return { success: true, feedback: `Volume ${nextVol}%` };
        }

        case 'VOLUME_DOWN': {
          const nextVol = Math.max(
            0,
            (preferences.isMuted ? 0 : preferences.volume) - 15
          );
          handleVolumeChange(nextVol);
          speak(`Volume ${nextVol}`);
          return { success: true, feedback: `Volume ${nextVol}%` };
        }

        case 'MUTE': {
          updatePreferences({ isMuted: true });
          return { success: true, feedback: 'Muted' };
        }

        case 'UNMUTE': {
          updatePreferences({ isMuted: false });
          speak('Unmuted');
          return { success: true, feedback: `Unmuted (${preferences.volume}%)` };
        }

        case 'REPEAT': {
          const order: RepeatMode[] = ['off', 'one', 'all'];
          const nextRepeat =
            order[(order.indexOf(preferences.repeatMode) + 1) % order.length];
          updatePreferences({ repeatMode: nextRepeat });
          const label =
            nextRepeat === 'one'
              ? 'Repeat one'
              : nextRepeat === 'all'
              ? 'Repeat all'
              : 'Repeat off';
          speak(label);
          return { success: true, feedback: label };
        }

        case 'SHUFFLE': {
          const nextShuffle = !preferences.isShuffle;
          updatePreferences({ isShuffle: nextShuffle });
          const msg = nextShuffle ? 'Shuffle on' : 'Shuffle off';
          speak(msg);
          return { success: true, feedback: msg };
        }

        case 'FAVORITE': {
          const isFav = handleToggleFavorite(currentTrack.id);
          const msg = isFav ? 'Saved to favorites' : 'Removed from favorites';
          speak(msg);
          return { success: true, feedback: msg };
        }

        case 'WHATS_PLAYING': {
          const msg = `${currentTrack.title} by ${currentTrack.artist}`;
          speak(msg);
          return { success: true, feedback: msg };
        }

        case 'ENABLE_RIDING_MODE': {
          setActiveTab('riding');
          speak('Riding Mode');
          return { success: true, feedback: 'Riding Mode on' };
        }

        case 'DISABLE_RIDING_MODE': {
          setActiveTab('player');
          speak('Standard player');
          return { success: true, feedback: 'Riding Mode off' };
        }

        default:
          return {
            success: false,
            feedback: 'Command not recognized',
          };
      }
    },
    [
      activeTab,
      currentTrack.artist,
      currentTrack.id,
      currentTrack.title,
      handleAddTrackToLibrary,
      handleNextTrack,
      handlePreviousTrack,
      handleSelectTrack,
      handleStopPlayback,
      handleToggleFavorite,
      handleVolumeChange,
      libraryTracks,
      preferences.isMuted,
      preferences.isShuffle,
      preferences.repeatMode,
      preferences.voiceFeedback,
      preferences.voiceLanguage,
      preferences.volume,
      preferences.youtubeApiKey,
      updatePreferences,
    ]
  );

  const handleEnterRidingMode = () => {
    setActiveTab('riding');
    if (preferences.ridingModeAutoVoice && capabilities.speechRecognitionSupported) {
      if (!isListeningDesired) {
        AudioService.playMicOnSound();
      }
      setIsListeningDesired(true);
    }
  };

  return (
    <div
      data-theme={preferences.theme || 'emerald'}
      className="min-h-screen bg-obsidian-950 text-zinc-100 flex flex-col pb-24 md:pb-10 transition-colors duration-300"
    >
      {/* Minimalist Top Header */}
      <header className="sticky top-0 z-30 bg-obsidian-950/80 backdrop-blur-xl">
        <div className="mx-auto max-w-md px-4 h-14 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('player')}
            className="flex items-center gap-2 text-left shrink-0"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-obsidian-950 transition-colors">
              <Disc3
                className={`h-4 w-4 ${isPlaying ? 'animate-spin-slow' : ''}`}
              />
            </div>
            <span className="text-base font-bold font-display tracking-tight text-white">
              Gaan
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-1 rounded-full border border-zinc-800/80 bg-obsidian-900/80 p-1">
            {(
              [
                { id: 'player', label: 'Player' },
                { id: 'search', label: 'Search' },
                { id: 'library', label: 'Library' },
                { id: 'settings', label: 'Settings' },
              ] as const
            ).map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-emerald-500 text-obsidian-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={handleEnterRidingMode}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 transition shrink-0"
          >
            <Navigation className="h-3 w-3" />
            <span>Ride</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-2 space-y-3">
        <VoiceAssistant
          preferences={preferences}
          capabilities={capabilities}
          isListeningDesired={isListeningDesired}
          onToggleListening={setIsListeningDesired}
          onCommandRecognized={handleVoiceCommand}
          voiceStatus={voiceStatus}
          setVoiceStatus={setVoiceStatus}
          liveTranscript={liveTranscript}
          setLiveTranscript={setLiveTranscript}
          lastFeedback={lastFeedback}
          setLastFeedback={setLastFeedback}
          voiceLogs={voiceLogs}
          onAddVoiceLog={handleAddVoiceLog}
          compact={activeTab === 'riding'}
        />

        <YouTubePlayer
          track={currentTrack}
          isPlaying={isPlaying}
          volume={preferences.volume}
          isMuted={preferences.isMuted}
          showVideoFrame={preferences.showVideoFrame && activeTab === 'player'}
          seekRequest={seekRequest}
          stopRequest={stopRequest}
          onPlayStateChange={setIsPlaying}
          onBufferingChange={setIsBuffering}
          onProgress={(cur, dur) => {
            setCurrentTime(cur);
            if (dur > 0) setDuration(dur);
          }}
          onEnded={handleTrackEnded}
          onMetadataEnriched={handleMetadataEnriched}
          onEmbedRestricted={handleEmbedRestricted}
          onSkipNext={handleNextTrack}
        />

        {activeTab === 'player' && (
          <MusicPlayer
            currentTrack={currentTrack}
            queue={queue}
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            currentTime={currentTime}
            duration={duration}
            volume={preferences.volume}
            isMuted={preferences.isMuted}
            repeatMode={preferences.repeatMode}
            isShuffle={preferences.isShuffle}
            isFavorite={favoriteIds.includes(currentTrack.id)}
            preferences={preferences}
            voiceStatus={voiceStatus}
            isListeningDesired={isListeningDesired}
            onTogglePlay={handleTogglePlay}
            onStop={handleStopPlayback}
            onNext={handleNextTrack}
            onPrevious={handlePreviousTrack}
            onSeek={(seconds) =>
              setSeekRequest({ seconds, timestamp: Date.now() })
            }
            onVolumeChange={handleVolumeChange}
            onToggleMute={() =>
              updatePreferences({ isMuted: !preferences.isMuted })
            }
            onCycleRepeat={() => {
              const order: RepeatMode[] = ['off', 'one', 'all'];
              const next =
                order[(order.indexOf(preferences.repeatMode) + 1) % order.length];
              updatePreferences({ repeatMode: next });
            }}
            onToggleShuffle={() =>
              updatePreferences({ isShuffle: !preferences.isShuffle })
            }
            onToggleFavorite={handleToggleFavorite}
            onToggleVideoFrame={() =>
              updatePreferences({ showVideoFrame: !preferences.showVideoFrame })
            }
            onEnterRidingMode={handleEnterRidingMode}
            onToggleVoiceListening={() => {
              if (isListeningDesired) {
                AudioService.playMicOffSound();
                setIsListeningDesired(false);
              } else {
                AudioService.playMicOnSound();
                setIsListeningDesired(true);
              }
            }}
            onSelectTrack={(t) => handleSelectTrack(t, true)}
          />
        )}

        {activeTab === 'riding' && (
          <RidingMode
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            volume={preferences.volume}
            isMuted={preferences.isMuted}
            voiceStatus={voiceStatus}
            isListeningDesired={isListeningDesired}
            liveTranscript={liveTranscript}
            lastFeedback={lastFeedback}
            wakeLockActive={wakeLockActive}
            preferences={preferences}
            capabilities={capabilities}
            onToggleListening={() => {
              if (isListeningDesired) {
                AudioService.playMicOffSound();
                setIsListeningDesired(false);
              } else {
                AudioService.playMicOnSound();
                setIsListeningDesired(true);
              }
            }}
            onTogglePlay={handleTogglePlay}
            onNext={handleNextTrack}
            onPrevious={handlePreviousTrack}
            onVolumeUp={() => handleVolumeChange(preferences.volume + 15)}
            onVolumeDown={() => handleVolumeChange(preferences.volume - 15)}
            onToggleVoiceFeedback={() =>
              updatePreferences({ voiceFeedback: !preferences.voiceFeedback })
            }
            onExitRidingMode={() => setActiveTab('player')}
          />
        )}

        {activeTab === 'search' && (
          <SearchPage
            libraryTracks={libraryTracks}
            currentTrack={currentTrack}
            favoriteIds={favoriteIds}
            playlists={playlists}
            youtubeApiKey={preferences.youtubeApiKey}
            initialSearchQuery={pendingSearchQuery}
            onPlayTrack={(track) => handleSelectTrack(track, true)}
            onAddTrackToLibrary={handleAddTrackToLibrary}
            onToggleFavorite={handleToggleFavorite}
            onAddTrackToPlaylist={handleAddTrackToPlaylist}
          />
        )}

        {activeTab === 'library' && (
          <PlaylistManager
            libraryTracks={libraryTracks}
            favoriteIds={favoriteIds}
            playlists={playlists}
            recentlyPlayed={recentlyPlayed}
            currentTrack={currentTrack}
            onPlayTrack={(track) => handleSelectTrack(track, true)}
            onPlayQueue={handlePlayQueue}
            onToggleFavorite={handleToggleFavorite}
            onCreatePlaylist={handleCreatePlaylist}
            onImportYouTubePlaylist={handleImportYouTubePlaylist}
            onDeletePlaylist={handleDeletePlaylist}
            onRemoveTrackFromPlaylist={handleRemoveTrackFromPlaylist}
            onRemoveTrackFromLibrary={handleRemoveTrackFromLibrary}
          />
        )}

        {activeTab === 'settings' && (
          <Settings
            preferences={preferences}
            capabilities={capabilities}
            currentTrack={currentTrack}
            onUpdatePreferences={updatePreferences}
            onResetPreferences={() => {
              setPreferences(DEFAULT_PREFERENCES);
              StorageService.savePreferences(DEFAULT_PREFERENCES);
            }}
          />
        )}
      </main>

      {/* Compact Mini Player when browsing Search / Library / Settings */}
      {activeTab !== 'player' && activeTab !== 'riding' && (
        <div className="fixed bottom-16 md:bottom-4 left-4 right-4 mx-auto max-w-md z-30 rounded-2xl border border-zinc-800/80 bg-obsidian-900/95 backdrop-blur-xl p-2.5 shadow-2xl flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('player')}
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
          >
            <img
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              className="h-9 w-9 rounded-lg object-cover shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">
                {currentTrack.title}
              </p>
              <p className="text-[11px] text-zinc-500 truncate">
                {currentTrack.artist}
              </p>
            </div>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="p-2 rounded-full bg-emerald-500 text-obsidian-950"
            >
              {isPlaying ? (
                <Pause className="h-3.5 w-3.5 fill-current" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={handleNextTrack}
              aria-label="Next"
              className="p-2 rounded-full text-zinc-300 hover:text-white"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Minimalist Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-zinc-800/60 bg-obsidian-950/90 backdrop-blur-xl px-3 py-1.5">
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          {(
            [
              { id: 'player', label: 'Player', icon: Disc3 },
              { id: 'riding', label: 'Ride', icon: Navigation },
              { id: 'search', label: 'Search', icon: Search },
              { id: 'library', label: 'Library', icon: Library },
              { id: 'settings', label: 'Settings', icon: SettingsIcon },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  item.id === 'riding'
                    ? handleEnterRidingMode()
                    : setActiveTab(item.id)
                }
                className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-medium transition ${
                  active ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="h-4 w-4 mb-0.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default App;
