export type RepeatMode = 'off' | 'one' | 'all';

export type NavigationTab = 'player' | 'riding' | 'search' | 'library' | 'settings';

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'success' | 'error' | 'denied';

export type VoiceLanguage = 'en-IN';

export type ThemePreset = 'emerald' | 'light' | 'ocean' | 'violet' | 'rose' | 'amber';

export interface Track {
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
  category?: 'riding' | 'relaxing' | 'pop' | 'rock' | 'bangla' | 'lofi' | 'custom';
  tags?: string[];
  addedAt?: number;
  playlistId?: string; // Optional YouTube playlist ID if added from a playlist URL
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackIds: string[];
  youtubePlaylistId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserPreferences {
  wakePhrase: string;
  requireWakePhrase: boolean;
  voiceLanguage: VoiceLanguage;
  voiceFeedback: boolean;
  announceTrackChanges: boolean;
  volume: number;
  isMuted: boolean;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  ridingModeAutoVoice: boolean;
  ridingModeWakeLock: boolean;
  preferDesktopYouTube: boolean;
  showVideoFrame: boolean;
  theme: ThemePreset;
  youtubeApiKey: string;
}

export type VoiceCommandAction =
  | 'PLAY_QUERY'
  | 'NEXT_TRACK'
  | 'PREVIOUS_TRACK'
  | 'PAUSE'
  | 'RESUME'
  | 'STOP'
  | 'VOLUME_UP'
  | 'VOLUME_DOWN'
  | 'MUTE'
  | 'UNMUTE'
  | 'REPEAT'
  | 'SHUFFLE'
  | 'FAVORITE'
  | 'WHATS_PLAYING'
  | 'ENABLE_RIDING_MODE'
  | 'DISABLE_RIDING_MODE'
  | 'UNKNOWN';

export interface ParsedVoiceCommand {
  rawTranscript: string;
  normalizedTranscript: string;
  wakeWordDetected: boolean;
  commandText: string;
  action: VoiceCommandAction;
  query?: string;
  confidence: number;
  timestamp: number;
}

export interface VoiceLogEntry {
  id: string;
  transcript: string;
  action: VoiceCommandAction;
  query?: string;
  status: 'executed' | 'ignored' | 'unrecognized' | 'duplicate';
  feedbackMessage: string;
  timestamp: number;
}

export interface BrowserCapabilities {
  isIOS: boolean;
  isIPadOS: boolean;
  isSafari: boolean;
  isMobile: boolean;
  isDesktopModeOnMobile: boolean;
  isStandalonePWA: boolean;
  speechRecognitionSupported: boolean;
  speechSynthesisSupported: boolean;
  mediaSessionSupported: boolean;
  wakeLockSupported: boolean;
  userAgent: string;
  limitations: string[];
  recommendations: string[];
}
