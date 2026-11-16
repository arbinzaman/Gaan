import { Track } from '../types/music';

export interface MediaSessionCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onNextTrack: () => void;
  onPreviousTrack: () => void;
  onSeekTo: (seconds: number) => void;
  onSeekBy: (deltaSeconds: number) => void;
}

export const MediaSessionManager = {
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
  },

  updateMetadata(track: Track | null): void {
    if (!this.isSupported() || !track || typeof MediaMetadata === 'undefined') return;

    try {
      const thumbHq = `https://i.ytimg.com/vi/${track.youtubeId}/hqdefault.jpg`;
      const thumbMq = `https://i.ytimg.com/vi/${track.youtubeId}/mqdefault.jpg`;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: 'Gaan • Voice YouTube Player',
        artwork: [
          { src: thumbMq, sizes: '320x180', type: 'image/jpeg' },
          { src: thumbHq, sizes: '480x360', type: 'image/jpeg' },
          { src: track.thumbnail || thumbHq, sizes: '512x512', type: 'image/jpeg' },
        ],
      });
    } catch (err) {
      console.warn('MediaSessionManager: Failed to set metadata', err);
    }
  },

  updatePlaybackState(isPlaying: boolean): void {
    if (!this.isSupported()) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {
      // Ignore unsupported environments
    }
  },

  updatePositionState(currentTime: number, duration: number, playbackRate = 1): void {
    if (!this.isSupported() || !navigator.mediaSession.setPositionState) return;
    if (!Number.isFinite(duration) || duration <= 0) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, duration),
        playbackRate,
        position: Math.min(Math.max(0, currentTime), duration),
      });
    } catch {
      // Ignore position state errors during buffering
    }
  },

  registerHandlers(callbacks: MediaSessionCallbacks): () => void {
    if (!this.isSupported()) return () => {};

    const safeSetHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Not all browsers support all MediaSessionActions (e.g., 'stop' on older iOS)
      }
    };

    safeSetHandler('play', () => callbacks.onPlay());
    safeSetHandler('pause', () => callbacks.onPause());
    safeSetHandler('stop', () => callbacks.onStop());
    safeSetHandler('nexttrack', () => callbacks.onNextTrack());
    safeSetHandler('previoustrack', () => callbacks.onPreviousTrack());
    safeSetHandler('seekbackward', (details) => {
      const offset = details.seekOffset || 10;
      callbacks.onSeekBy(-offset);
    });
    safeSetHandler('seekforward', (details) => {
      const offset = details.seekOffset || 10;
      callbacks.onSeekBy(offset);
    });
    safeSetHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        callbacks.onSeekTo(details.seekTime);
      }
    });

    return () => {
      safeSetHandler('play', null);
      safeSetHandler('pause', null);
      safeSetHandler('stop', null);
      safeSetHandler('nexttrack', null);
      safeSetHandler('previoustrack', null);
      safeSetHandler('seekbackward', null);
      safeSetHandler('seekforward', null);
      safeSetHandler('seekto', null);
    };
  },
};
