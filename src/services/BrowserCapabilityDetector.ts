import { BrowserCapabilities } from '../types/music';

declare global {
  interface Window {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  }
  interface Navigator {
    standalone?: boolean;
  }
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isIOS: false,
      isIPadOS: false,
      isSafari: false,
      isMobile: false,
      isDesktopModeOnMobile: false,
      isStandalonePWA: false,
      speechRecognitionSupported: false,
      speechSynthesisSupported: false,
      mediaSessionSupported: false,
      wakeLockSupported: false,
      userAgent: '',
      limitations: [],
      recommendations: [],
    };
  }

  const ua = navigator.userAgent || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  // Detect standard iOS (iPhone/iPod/iPad)
  const isClassicIOS = /iPad|iPhone|iPod/.test(ua);
  // Detect iOS/iPadOS Safari when "Request Desktop Website" is active (reports Macintosh with multi-touch)
  const isDesktopModeOnIOS = /Macintosh/.test(ua) && maxTouchPoints > 1;
  const isIOS = isClassicIOS || isDesktopModeOnIOS;
  const isIPadOS = /iPad/.test(ua) || isDesktopModeOnIOS;

  // Safari detection (excludes Chrome/CriOS/FxiOS/EdgiOS)
  const isSafari =
    /Safari/.test(ua) &&
    !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS|SamsungBrowser/.test(ua);

  const isMobile =
    isIOS || /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  const isDesktopModeOnMobile =
    isDesktopModeOnIOS || (!/Mobi|Android|iPhone/i.test(ua) && maxTouchPoints > 2);

  const isStandalonePWA =
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    navigator.standalone === true;

  const speechRecognitionSupported = Boolean(
    window.SpeechRecognition || window.webkitSpeechRecognition
  );

  const speechSynthesisSupported =
    'speechSynthesis' in window && typeof window.speechSynthesis !== 'undefined';

  const mediaSessionSupported = 'mediaSession' in navigator;

  const wakeLockSupported = 'wakeLock' in navigator;

  const limitations: string[] = [];
  const recommendations: string[] = [];

  if (!speechRecognitionSupported) {
    limitations.push(
      'Web Speech API (SpeechRecognition) is not supported in this browser. Voice commands require Safari (iOS 14.5+), Chrome, or Edge.'
    );
  }

  if (isIOS || isSafari) {
    limitations.push(
      'iOS & Safari suspend microphone access (Web Speech API) whenever the screen is locked or Safari goes into the background.'
    );
    limitations.push(
      'iOS Safari stops continuous SpeechRecognition after ~60 seconds of silence or between sessions; Gaan automatically restarts the listener while the page remains active in the foreground.'
    );
    limitations.push(
      'YouTube IFrame video playback may pause when locking the iPhone screen unless Controlled via Lock Screen / Control Center Resume or opened in Safari Request Desktop Website mode.'
    );

    recommendations.push(
      'Enable Riding Mode with Screen Wake Lock ON before putting your phone in your pocket so the screen stays active (dimmed dark UI) and voice listening remains live.'
    );
    recommendations.push(
      'Use Bluetooth helmet intercom buttons (Cardo / Sena / AirPods): Gaan registers Next, Previous, Play, and Pause with iOS Media Session so hardware buttons work even if the microphone is paused.'
    );
    recommendations.push(
      'For native YouTube background audio on iPhone, use the "Open in YouTube Desktop" option with Safari\'s "Request Desktop Website" (aA menu).'
    );
  } else if (isMobile) {
    limitations.push(
      'Mobile browsers only allow Web Speech API microphone recognition while the browser tab stays in the foreground with Screen Wake Lock active.'
    );
    recommendations.push(
      'Keep Riding Mode active so Screen Wake Lock prevents the OS from sleeping the microphone listener.'
    );
  } else {
    recommendations.push(
      'Keep this tab active or visible in a window for uninterrupted Web Speech API voice command recognition.'
    );
  }

  return {
    isIOS,
    isIPadOS,
    isSafari,
    isMobile,
    isDesktopModeOnMobile,
    isStandalonePWA,
    speechRecognitionSupported,
    speechSynthesisSupported,
    mediaSessionSupported,
    wakeLockSupported,
    userAgent: ua,
    limitations,
    recommendations,
  };
}
