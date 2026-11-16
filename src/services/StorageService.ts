import { Track, Playlist, UserPreferences } from '../types/music';
import { DEFAULT_CATALOG, DEFAULT_PLAYLISTS } from '../data/catalog';

const STORAGE_KEYS = {
  PREFERENCES: 'gaan_preferences_v7',
  LIBRARY_TRACKS: 'gaan_library_tracks_v7',
  FAVORITE_IDS: 'gaan_favorite_ids_v7',
  PLAYLISTS: 'gaan_playlists_v7',
  RECENTLY_PLAYED: 'gaan_recently_played_v7',
  LAST_PLAYED: 'gaan_last_played_v7',
  RIDING_MODE: 'gaan_riding_mode_v7',
} as const;

export const DEFAULT_PREFERENCES: UserPreferences = {
  wakePhrase: 'Hey Gaan',
  requireWakePhrase: false,
  voiceLanguage: 'en-IN',
  voiceFeedback: true, // Spoken Text-to-Speech confirmation ON by default
  announceTrackChanges: true,
  volume: 85,
  isMuted: false,
  repeatMode: 'off',
  isShuffle: false,
  ridingModeAutoVoice: true,
  ridingModeWakeLock: true,
  preferDesktopYouTube: true,
  showVideoFrame: false, // Clean album art + native <audio> by default for reliable iPhone background playback
  theme: 'ocean',
  youtubeApiKey: '',
};

const IDB_NAME = 'GaanMusicDB';
const IDB_VERSION = 1;
const IDB_STORE = 'kv_store';

function saveToIndexedDB(key: string, value: unknown): void {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return;
  try {
    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => db.close();
    };
  } catch {
    // Fallback is LocalStorage
  }
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    saveToIndexedDB(key, value);
  } catch (err) {
    console.warn(`StorageService: Failed to persist ${key}`, err);
  }
}

export const StorageService = {
  getPreferences(): UserPreferences {
    const saved = readJson<Partial<UserPreferences>>(STORAGE_KEYS.PREFERENCES, {});
    return { ...DEFAULT_PREFERENCES, ...saved };
  },

  savePreferences(prefs: UserPreferences): void {
    writeJson(STORAGE_KEYS.PREFERENCES, prefs);
  },

  getLibraryTracks(): Track[] {
    const saved = readJson<Track[] | null>(STORAGE_KEYS.LIBRARY_TRACKS, null);
    if (!saved || saved.length === 0) {
      writeJson(STORAGE_KEYS.LIBRARY_TRACKS, DEFAULT_CATALOG);
      return DEFAULT_CATALOG;
    }
    const existingIds = new Set(saved.map((t) => t.id));
    const merged = [...saved];
    for (const item of DEFAULT_CATALOG) {
      if (!existingIds.has(item.id)) {
        merged.push(item);
      }
    }
    return merged;
  },

  saveLibraryTracks(tracks: Track[]): void {
    writeJson(STORAGE_KEYS.LIBRARY_TRACKS, tracks);
  },

  addTrackToLibrary(track: Track): Track[] {
    const current = this.getLibraryTracks();
    const existingIndex = current.findIndex(
      (t) => t.id === track.id || t.youtubeId === track.youtubeId
    );
    let updated: Track[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = { ...updated[existingIndex], ...track };
    } else {
      updated = [{ ...track, addedAt: Date.now() }, ...current];
    }
    this.saveLibraryTracks(updated);
    return updated;
  },

  removeTrackFromLibrary(trackId: string): Track[] {
    const current = this.getLibraryTracks();
    const updated = current.filter((t) => t.id !== trackId);
    this.saveLibraryTracks(updated);
    return updated;
  },

  getFavoriteIds(): string[] {
    return readJson<string[]>(STORAGE_KEYS.FAVORITE_IDS, [
      'track-relaxing-lofi',
      'track-shape-of-you',
      'track-believer',
    ]);
  },

  saveFavoriteIds(ids: string[]): void {
    writeJson(STORAGE_KEYS.FAVORITE_IDS, ids);
  },

  toggleFavorite(trackId: string): { favoriteIds: string[]; isFavorite: boolean } {
    const current = this.getFavoriteIds();
    const exists = current.includes(trackId);
    const updated = exists
      ? current.filter((id) => id !== trackId)
      : [trackId, ...current];
    this.saveFavoriteIds(updated);
    return { favoriteIds: updated, isFavorite: !exists };
  },

  getPlaylists(): Playlist[] {
    const saved = readJson<Playlist[] | null>(STORAGE_KEYS.PLAYLISTS, null);
    if (!saved || saved.length === 0) {
      writeJson(STORAGE_KEYS.PLAYLISTS, DEFAULT_PLAYLISTS);
      return DEFAULT_PLAYLISTS;
    }
    return saved;
  },

  savePlaylists(playlists: Playlist[]): void {
    writeJson(STORAGE_KEYS.PLAYLISTS, playlists);
  },

  getRecentlyPlayed(): Track[] {
    return readJson<Track[]>(STORAGE_KEYS.RECENTLY_PLAYED, [
      DEFAULT_CATALOG[3],
      DEFAULT_CATALOG[0],
      DEFAULT_CATALOG[1],
    ]);
  },

  addRecentlyPlayed(track: Track): Track[] {
    const current = this.getRecentlyPlayed();
    const filtered = current.filter((t) => t.youtubeId !== track.youtubeId);
    const updated = [track, ...filtered].slice(0, 25);
    writeJson(STORAGE_KEYS.RECENTLY_PLAYED, updated);
    this.saveLastPlayed(track);
    return updated;
  },

  getLastPlayed(): Track {
    const saved = readJson<Track | null>(STORAGE_KEYS.LAST_PLAYED, null);
    return saved || DEFAULT_CATALOG[3]; // Start on 100% embeddable Lofi Hip Hop Radio stream
  },

  saveLastPlayed(track: Track): void {
    writeJson(STORAGE_KEYS.LAST_PLAYED, track);
  },

  getRidingMode(): boolean {
    return readJson<boolean>(STORAGE_KEYS.RIDING_MODE, false);
  },

  saveRidingMode(enabled: boolean): void {
    writeJson(STORAGE_KEYS.RIDING_MODE, enabled);
  },
};
