import { ParsedVoiceCommand, VoiceCommandAction } from '../types/music';

const GAAN_WAKE_VARIATIONS = [
  'hey gaan',
  'hey gan',
  'hey gun',
  'hey ghan',
  'hey gaon',
  'hey khan',
  'hey dan',
  'hey don',
  'hey john',
  'hey god',
  'hey girl',
  'hey man',
  'hey guys',
  'hey ron',
  'hey jan',
  'hey dawn',
  'hey gawn',
  'hey gone',
  'he gaan',
  'he gan',
  'a gaan',
  'a gun',
  'ok gaan',
  'okay gaan',
  'hello gaan',
  'hi gaan',
  'yo gaan',
  'again',
  'reagan',
  'megan',
  'pagan',
  'vegan',
  'begone',
  'এই গান',
  'হেই গান',
  'হে গান',
  'ও গান',
  'हे गान',
  'अरे गान',
  'ہی گان',
];

export function extractWakeWord(
  rawText: string,
  customWakePhrase = 'Hey Gaan'
): { wakeWordDetected: boolean; commandText: string; normalizedTranscript: string } {
  const normalizedTranscript = rawText
    .trim()
    .replace(/[.,!?;:"'—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = normalizedTranscript.toLowerCase();
  const customLower = customWakePhrase
    .toLowerCase()
    .replace(/[.,!?;:"'—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const candidatePhrases = new Set<string>([customLower, ...GAAN_WAKE_VARIATIONS]);
  const sortedPhrases = Array.from(candidatePhrases)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const wake of sortedPhrases) {
    const idx = lower.indexOf(wake);
    if (idx !== -1) {
      const afterWake = normalizedTranscript.slice(idx + wake.length).trim();
      return {
        wakeWordDetected: true,
        commandText: afterWake,
        normalizedTranscript,
      };
    }
  }

  // Catch any "hey/hi/ok/okay/hello <single-word>" prefix that STT transcribed for "Hey Gaan"
  const genericGreetingMatch = normalizedTranscript.match(
    /^(?:hey|hi|hello|ok|okay|yo|হেই|হে|हे)\s+(?:there\s+)?\S+\s+(.+)$/i
  );
  if (genericGreetingMatch && genericGreetingMatch[1]) {
    return {
      wakeWordDetected: true,
      commandText: genericGreetingMatch[1].trim(),
      normalizedTranscript,
    };
  }

  const standaloneMatch = lower.match(/^(?:gaan|gan|ghan|gun|গান|गान)(?:\s+|$)(.*)$/i);
  if (standaloneMatch) {
    const prefixLen = lower.length - standaloneMatch[1].length;
    return {
      wakeWordDetected: true,
      commandText: normalizedTranscript.slice(prefixLen).trim(),
      normalizedTranscript,
    };
  }

  return {
    wakeWordDetected: false,
    commandText: normalizedTranscript,
    normalizedTranscript,
  };
}

export function parseVoiceCommand(
  rawTranscript: string,
  options?: {
    wakePhrase?: string;
    requireWakePhrase?: boolean;
    confidence?: number;
  }
): ParsedVoiceCommand {
  const wakePhrase = options?.wakePhrase || 'Hey Gaan';
  const requireWakePhrase = options?.requireWakePhrase ?? false;
  const confidence = options?.confidence ?? 1;

  const { wakeWordDetected, commandText, normalizedTranscript } = extractWakeWord(
    rawTranscript,
    wakePhrase
  );

  if (requireWakePhrase && !wakeWordDetected) {
    return {
      rawTranscript,
      normalizedTranscript,
      wakeWordDetected: false,
      commandText,
      action: 'UNKNOWN',
      confidence,
      timestamp: Date.now(),
    };
  }

  // Strip conversational filler words around the command
  const cleanedCommand = commandText
    .replace(
      /^(?:please|can\s+you|could\s+you|would\s+you|i\s+want\s+to|i\s+would\s+like\s+to|let\s*s|uh|um|okay|ok|hey|hi|now)\s+/i,
      ''
    )
    .replace(/\s+(?:please|right\s+now|now|thanks|thank\s+you|for\s+me)$/i, '')
    .trim();

  const target = cleanedCommand.toLowerCase();

  if (!target) {
    return {
      rawTranscript,
      normalizedTranscript,
      wakeWordDetected,
      commandText: '',
      action: 'UNKNOWN',
      confidence,
      timestamp: Date.now(),
    };
  }

  let action: VoiceCommandAction = 'UNKNOWN';
  let query: string | undefined;

  // 1. Next Track (English, Bangla, Hindi, Urdu, Spanish, Arabic)
  if (
    /\b(?:next\s+(?:song|track|music|one)|skip(?:\s+song|\s+track|\s+this)?|play\s+next|agla\s+gana|siguiente)\b/i.test(
      target
    ) ||
    /(?:পরের\s*গান|নেক্সট(?:\s*গান)?|अगला\s*गाना|اگلا\s*گانا|التالي)/i.test(target) ||
    /^(?:next|skip|forward)$/i.test(target)
  ) {
    action = 'NEXT_TRACK';
  }
  // 2. Previous Track
  else if (
    /\b(?:previous\s+(?:song|track|music|one)|prev\s+(?:song|track)|go\s+back|last\s+song|back\s+track|pichla\s+gana|anterior)\b/i.test(
      target
    ) ||
    /(?:আগের\s*গান|প্রিভিয়াস(?:\s*গান)?|पिछला\s*गाना|پچھلا\s*گانا|السابق)/i.test(
      target
    ) ||
    /^(?:previous|prev|back)$/i.test(target)
  ) {
    action = 'PREVIOUS_TRACK';
  }
  // 3. Stop
  else if (
    /\b(?:stop\s+(?:music|playback|playing|song|the\s+music)|band\s+karo)\b/i.test(
      target
    ) ||
    /(?:গান\s*বন্ধ\s*করো|বন্ধ\s*করো|স্টপ|गाना\s*बंद\s*करो|बंद\s*करो|بند\s*کرو|توقف)/i.test(
      target
    ) ||
    /^stop$/i.test(target)
  ) {
    action = 'STOP';
  }
  // 4. Pause
  else if (
    /\b(?:pause(?:\s+music|\s+playback|\s+song|\s+the\s+music)?|roko|pausa)\b/i.test(
      target
    ) ||
    /(?:গান\s*থামাও|থামাও|পজ|रोको|ركو|إيقاف)/i.test(target) ||
    /^(?:hold\s+on|wait)$/i.test(target)
  ) {
    action = 'PAUSE';
  }
  // 5. Volume Up
  else if (
    /\b(?:volume\s+up|increase\s+(?:the\s+)?volume|turn\s+(?:it\s+|the\s+volume\s+)?up|raise\s+(?:the\s+)?volume|make\s+it\s+louder|awaz\s+badhao|sound\s+barao|subir\s+volumen)\b/i.test(
      target
    ) ||
    /(?:সাউন্ড\s*বাড়াও|ভলিউম\s*বাড়াও|আওয়াজ\s*বাড়াও|आवाज\s*बढ़ाओ|آواز\s*بڑھاؤ|رفع\s*الصوت)/i.test(
      target
    ) ||
    /^(?:louder|up\s+volume)$/i.test(target)
  ) {
    action = 'VOLUME_UP';
  }
  // 6. Volume Down
  else if (
    /\b(?:volume\s+down|decrease\s+(?:the\s+)?volume|lower\s+(?:the\s+)?volume|turn\s+(?:it\s+|the\s+volume\s+)?down|make\s+it\s+quieter|awaz\s+kam\s+karo|sound\s+komao|bajar\s+volumen)\b/i.test(
      target
    ) ||
    /(?:সাউন্ড\s*কমাও|ভলিউম\s*কমাও|আওয়াজ\s*কমাও|आवाज\s*कम\s*करो|آواز\s*کم\s*کرو|خفض\s*الصوت)/i.test(
      target
    ) ||
    /^(?:quieter|softer|down\s+volume)$/i.test(target)
  ) {
    action = 'VOLUME_DOWN';
  }
  // 7. Unmute
  else if (
    /\b(?:unmute(?:\s+audio|\s+music|\s+sound)?|restore\s+(?:audio|sound|volume)|sound\s+on)\b/i.test(
      target
    ) ||
    /(?:আনমিউট|সাউন্ড\s*চালু\s*করো)/i.test(target)
  ) {
    action = 'UNMUTE';
  }
  // 8. Mute
  else if (
    /\b(?:mute(?:\s+audio|\s+music|\s+sound)?|silence(?:\s+music|\s+audio)?|sound\s+off|silencio)\b/i.test(
      target
    ) ||
    /(?:মিউট|সাউন্ড\s*বন্ধ\s*করো|म्यूट|كتم)/i.test(target)
  ) {
    action = 'MUTE';
  }
  // 9. Repeat
  else if (
    /\b(?:repeat(?:\s+song|\s+track|\s+current\s+track|\s+mode|\s+this)?|loop(?:\s+song|\s+track|\s+this)?|repetir)\b/i.test(
      target
    ) ||
    /(?:রিপিট|বারবার\s*বাজাও|दोहराएं)/i.test(target)
  ) {
    action = 'REPEAT';
  }
  // 10. Shuffle
  else if (
    /\b(?:shuffle(?:\s+playlist|\s+music|\s+songs|\s+tracks|\s+mode)?|mix\s+(?:playlist|songs)?|mix|aleatorio)\b/i.test(
      target
    ) ||
    /(?:শাফল|এলোমেলো\s*বাজাও)/i.test(target)
  ) {
    action = 'SHUFFLE';
  }
  // 11. Riding mode
  else if (
    /\b(?:enable\s+riding\s+mode|start\s+riding\s+mode|riding\s+mode\s+on|riding\s+mode)\b/i.test(
      target
    )
  ) {
    action = 'ENABLE_RIDING_MODE';
  } else if (
    /\b(?:disable\s+riding\s+mode|exit\s+riding\s+mode|stop\s+riding\s+mode|riding\s+mode\s+off|normal\s+mode)\b/i.test(
      target
    )
  ) {
    action = 'DISABLE_RIDING_MODE';
  }
  // 12. Favorite / What's playing
  else if (
    /\b(?:favorite|add\s+to\s+favorites|like\s+this\s+song|save\s+this\s+song)\b/i.test(
      target
    ) ||
    /পছন্দ|पसंद/i.test(target)
  ) {
    action = 'FAVORITE';
  } else if (
    /\b(?:what(?:'s|\s+is)\s+playing|current\s+song|what\s+song\s+is\s+this)\b/i.test(
      target
    ) ||
    /(?:কেমন\s*গান\s*চলছে|কোন\s*গান\s*চলছে)/i.test(target)
  ) {
    action = 'WHATS_PLAYING';
  }
  // 13. Resume / bare Play
  else if (
    /^(?:resume(?:\s+music|\s+playback|\s+song)?|continue(?:\s+playing|\s+music)?|unpause|keep\s+playing|play(?:\s+music|\s+the\s+music|\s+song|\s+now)?|চালিয়ে\s*যাও|আবার\s*চালাও|গান\s*চালাও|चलाओ|بجاؤ)$/i.test(
      target
    )
  ) {
    action = 'RESUME';
  }
  // 14. Play [song / query] across English, Bangla, Hindi, Urdu, Spanish, Arabic
  else {
    const playMatch = cleanedCommand.match(
      /(?:^|\s)(?:play|put\s+on|listen\s+to|search\s+and\s+play|find\s+and\s+play|start\s+playing|bajao|chalao|reproducir|বাজাও|চালাও|গান\s+বাজাও|बजाओ|चलाओ|بجاؤ|چلاؤ|شغل)\s+(.+)$/i
    );
    if (playMatch && playMatch[1].trim()) {
      const extracted = playMatch[1]
        .trim()
        .replace(/\s+(?:on\s+youtube|please|right\s+now|for\s+me)$/i, '')
        .trim();

      if (/^(?:music|the\s+music|song|the\s+song|now)$/i.test(extracted)) {
        action = 'RESUME';
      } else {
        action = 'PLAY_QUERY';
        query = extracted;
      }
    } else {
      const suffixMatch = cleanedCommand.match(
        /^(.+?)\s+(?:বাজাও|চালাও|बजाओ|चलाओ|بجاؤ|چلاؤ|bajao|chalao)$/i
      );
      if (suffixMatch && suffixMatch[1].trim()) {
        action = 'PLAY_QUERY';
        query = suffixMatch[1].trim();
      } else if (wakeWordDetected && cleanedCommand.length >= 2) {
        // If user said "Hey Gaan, [Song Name]" directly, treat the remaining phrase as song search!
        action = 'PLAY_QUERY';
        query = cleanedCommand;
      }
    }
  }

  return {
    rawTranscript,
    normalizedTranscript,
    wakeWordDetected,
    commandText: cleanedCommand,
    action,
    query,
    confidence,
    timestamp: Date.now(),
  };
}

export class CommandDeduplicator {
  private lastSignature = '';
  private lastTimestamp = 0;
  private cooldownMs: number;

  constructor(cooldownMs = 1800) {
    this.cooldownMs = cooldownMs;
  }

  public shouldExecute(cmd: ParsedVoiceCommand): boolean {
    if (cmd.action === 'UNKNOWN') return false;
    const signature = `${cmd.action}:${(cmd.query || '').toLowerCase().trim()}`;
    const now = Date.now();

    if (
      signature === this.lastSignature &&
      now - this.lastTimestamp < this.cooldownMs
    ) {
      return false;
    }

    this.lastSignature = signature;
    this.lastTimestamp = now;
    return true;
  }

  public reset(): void {
    this.lastSignature = '';
    this.lastTimestamp = 0;
  }
}

export function getVoiceActionDescription(cmd: ParsedVoiceCommand): string {
  switch (cmd.action) {
    case 'PLAY_QUERY':
      return `Playing "${cmd.query}"`;
    case 'NEXT_TRACK':
      return 'Next track';
    case 'PREVIOUS_TRACK':
      return 'Previous track';
    case 'PAUSE':
      return 'Paused';
    case 'RESUME':
      return 'Resumed';
    case 'STOP':
      return 'Stopped';
    case 'VOLUME_UP':
      return 'Volume up';
    case 'VOLUME_DOWN':
      return 'Volume down';
    case 'MUTE':
      return 'Muted';
    case 'UNMUTE':
      return 'Unmuted';
    case 'REPEAT':
      return 'Repeat toggled';
    case 'SHUFFLE':
      return 'Shuffle toggled';
    case 'FAVORITE':
      return 'Favorite updated';
    case 'WHATS_PLAYING':
      return 'Current track';
    case 'ENABLE_RIDING_MODE':
      return 'Riding Mode on';
    case 'DISABLE_RIDING_MODE':
      return 'Riding Mode off';
    default:
      return 'Unrecognized command';
  }
}
