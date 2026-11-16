# Gaan — Voice-Controlled YouTube Music Player

**Gaan** is a frontend-only, hands-free voice-controlled YouTube music player built with **React, Vite, TypeScript, and Tailwind CSS** specifically for motorcycle riders, drivers, and commuters.

## Key Features

- **Dedicated Voice Control Engine (`VoiceAssistant` + `VoiceCommandParser`)**
  - Configurable wake phrase (default: `"Hey Gaan"`, with phonetic recognition for `"Hey Gan"`, `"Hey Gun"`, `"Hey Ghan"`, etc.)
  - Supports English (`en-US`, `en-IN`) and Bangla (`bn-BD`) voice commands
  - Duplicate command prevention (`CommandDeduplicator`) with cooldown window
  - Spoken audio confirmations via `window.speechSynthesis`
  - Built-in interactive Voice Tester / Command Simulator fallback

- **Supported Voice Commands**
  | Voice Command | Action |
  |---|---|
  | `"Hey Gaan, play [song]"` (e.g. `"Hey Gaan, play Hum"`, `"Hey Gaan, play Shape of You"`, `"Hey Gaan, play Believer"`) | Searches local library & built-in catalog and starts playback |
  | `"Hey Gaan, play something relaxing"` | Finds and plays relaxing / lo-fi / ambient music |
  | `"Next song"` / `"Hey Gaan, next song"` | Skips to the next track |
  | `"Previous song"` / `"Hey Gaan, previous song"` | Goes to the previous track |
  | `"Pause"` / `"Hey Gaan, pause"` | Pauses playback |
  | `"Resume"` / `"Play"` | Resumes playback |
  | `"Stop music"` | Stops playback |
  | `"Volume up"` / `"Increase volume"` | Increases volume by 15% |
  | `"Volume down"` / `"Decrease volume"` | Decreases volume by 15% |
  | `"Mute"` / `"Unmute"` | Mutes or restores audio |
  | `"Repeat"` | Cycles repeat mode (`Off` -> `Repeat One` -> `Repeat All`) |
  | `"Shuffle"` | Toggles playlist shuffle |
  | `"Favorite"` / `"What's playing"` | Favorites current track or announces current song aloud |

- **Official YouTube IFrame Player API Integration (`YouTubePlayer`)**
  - Plays standard YouTube links (`youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...`), YouTube Music links (`music.youtube.com/watch?v=...`), and 11-character Video IDs
  - Automatic metadata lookup via oEmbed + YouTube IFrame `getVideoData()`
  - One-click **YouTube Desktop Site** launcher for iOS Safari's *Request Desktop Website* mode

- **Dedicated Riding Mode (`RidingMode`)**
  - Full-screen high-contrast minimal interface with oversized glove-friendly controls
  - Giant central Microphone button and real-time voice command status readout
  - **Screen Wake Lock API (`navigator.wakeLock`)** integration + **Pocket Dimmer** mode to keep Safari foregrounded in your pocket so the microphone stays active while using minimal battery

- **Background Playback & Media Session API (`MediaSessionManager`)**
  - Publishes track title, artist, and artwork to the iOS/Android Lock Screen and Control Center
  - Registers hardware media button handlers (`play`, `pause`, `nexttrack`, `previoustrack`, `seekto`) so **Bluetooth helmet intercoms (Cardo, Sena) and earbuds** can skip tracks and pause/resume even when the phone screen is locked

- **Local Persistence (`StorageService`)**
  - Synchronizes Favorites, Custom Playlists, Recently Played, Last Played Song, Saved Songs, Wake Phrase, Volume, and Riding Mode preferences to both `LocalStorage` and `IndexedDB`

## iOS Safari & Mobile Browser Limitations (Documented)

1. **Microphone & Web Speech API in Background**:
   - iOS Safari and mobile browsers do **not** allow web pages to keep the microphone open (`SpeechRecognition`) when the phone screen is locked or when Safari is in the background.
   - **Recommended Rider Workflow**: Enable **Riding Mode** (which activates `navigator.wakeLock` to prevent screen sleep) and tap **Pocket Dim** before placing the phone in your pocket. This keeps Safari active in the foreground with a dark screen so voice commands continue working.
   - **Hardware Fallback**: When the screen is locked, use your helmet intercom or headphone hardware buttons (`Next`, `Previous`, `Play/Pause`), which communicate via the **Media Session API**.

2. **YouTube Embedded Background Playback on iOS Safari**:
   - Embedded YouTube IFrame players follow stricter iOS background policies than the full `youtube.com` desktop website.
   - Use the **YouTube Desktop** button on the Player or Settings screen alongside Safari's **Request Desktop Website** (`aA` menu in Safari) whenever you want native Safari lock-screen audio streaming.

## Local Setup & Commands

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Run unit tests
npm run test

# Type-check and build static production bundle (dist/)
npm run build

# Preview production build locally
npm run preview
```

## Static Deployment

Gaan is a 100% static frontend application with no backend or database dependencies. Deploy the generated `dist/` folder directly to Vercel, Netlify, GitHub Pages, or Cloudflare Pages.
