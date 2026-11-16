import { describe, it, expect } from 'vitest';
import {
  CommandDeduplicator,
  parseVoiceCommand,
} from '../services/VoiceCommandParser';
import {
  parseYouTubeInput,
  searchLocalCatalog,
} from '../services/YouTubeService';
import { DEFAULT_CATALOG } from '../data/catalog';

describe('VoiceCommandParser', () => {
  it('parses "Hey Gaan, play [song]" commands accurately', () => {
    const c1 = parseVoiceCommand('Hey Gaan, play Hum');
    expect(c1.wakeWordDetected).toBe(true);
    expect(c1.action).toBe('PLAY_QUERY');
    expect(c1.query).toBe('Hum');

    const c2 = parseVoiceCommand('Hey Gaan, play Shape of You');
    expect(c2.wakeWordDetected).toBe(true);
    expect(c2.action).toBe('PLAY_QUERY');
    expect(c2.query).toBe('Shape of You');

    const c3 = parseVoiceCommand('Hey Gaan, play Believer');
    expect(c3.action).toBe('PLAY_QUERY');
    expect(c3.query).toBe('Believer');

    const c4 = parseVoiceCommand('Hey Gaan, play something relaxing');
    expect(c4.action).toBe('PLAY_QUERY');
    expect(c4.query).toBe('something relaxing');
  });

  it('handles phonetic variations of "Hey Gaan" from Web Speech API and Whisper', () => {
    const c1 = parseVoiceCommand('Hey Gan play Believer');
    expect(c1.wakeWordDetected).toBe(true);
    expect(c1.action).toBe('PLAY_QUERY');
    expect(c1.query).toBe('Believer');

    const c2 = parseVoiceCommand('Hey gun, next song');
    expect(c2.wakeWordDetected).toBe(true);
    expect(c2.action).toBe('NEXT_TRACK');

    const c3 = parseVoiceCommand('Hey God, next song.');
    expect(c3.wakeWordDetected).toBe(true);
    expect(c3.action).toBe('NEXT_TRACK');

    const c4 = parseVoiceCommand('Hey John, play Shape of You');
    expect(c4.wakeWordDetected).toBe(true);
    expect(c4.action).toBe('PLAY_QUERY');
    expect(c4.query).toBe('Shape of You');
  });

  it('parses all playback, volume, and queue commands', () => {
    expect(parseVoiceCommand('Hey Gaan, next song').action).toBe('NEXT_TRACK');
    expect(parseVoiceCommand('Next song').action).toBe('NEXT_TRACK');
    expect(parseVoiceCommand('Hey Gaan, previous song').action).toBe('PREVIOUS_TRACK');
    expect(parseVoiceCommand('Previous song').action).toBe('PREVIOUS_TRACK');
    expect(parseVoiceCommand('Hey Gaan, pause').action).toBe('PAUSE');
    expect(parseVoiceCommand('Hey Gaan, resume').action).toBe('RESUME');
    expect(parseVoiceCommand('Play').action).toBe('RESUME');
    expect(parseVoiceCommand('Hey Gaan, stop music').action).toBe('STOP');
    expect(parseVoiceCommand('Hey Gaan, increase volume').action).toBe('VOLUME_UP');
    expect(parseVoiceCommand('Volume up').action).toBe('VOLUME_UP');
    expect(parseVoiceCommand('Hey Gaan, decrease volume').action).toBe('VOLUME_DOWN');
    expect(parseVoiceCommand('Volume down').action).toBe('VOLUME_DOWN');
    expect(parseVoiceCommand('Mute').action).toBe('MUTE');
    expect(parseVoiceCommand('Unmute').action).toBe('UNMUTE');
    expect(parseVoiceCommand('Repeat').action).toBe('REPEAT');
    expect(parseVoiceCommand('Shuffle').action).toBe('SHUFFLE');
  });

  it('supports Bangla, Hindi, and multilingual voice commands', () => {
    expect(parseVoiceCommand('হেই গান পরের গান').action).toBe('NEXT_TRACK');
    expect(parseVoiceCommand('হেই গান সাউন্ড বাড়াও').action).toBe('VOLUME_UP');
    expect(parseVoiceCommand('Hey Gaan, agla gana').action).toBe('NEXT_TRACK');
    expect(parseVoiceCommand('Hey Gaan, Kesariya chalao').query).toBe('Kesariya');
    const banglaPlay = parseVoiceCommand('হেই গান বাজাও Hum');
    expect(banglaPlay.action).toBe('PLAY_QUERY');
    expect(banglaPlay.query).toBe('Hum');

    const directWakeSong = parseVoiceCommand('হেই গান কফি হাউস');
    expect(directWakeSong.action).toBe('PLAY_QUERY');
    expect(directWakeSong.query).toBe('কফি হাউস');
  });

  it('prevents duplicate command execution within cooldown window', () => {
    const dedup = new CommandDeduplicator(2000);
    const cmd = parseVoiceCommand('Hey Gaan, next song');
    expect(dedup.shouldExecute(cmd)).toBe(true);
    expect(dedup.shouldExecute(cmd)).toBe(false);

    const diffCmd = parseVoiceCommand('Hey Gaan, pause');
    expect(dedup.shouldExecute(diffCmd)).toBe(true);
  });
});

describe('YouTubeService & Catalog Search', () => {
  it('parses standard YouTube, YouTube Music, short URLs, and Video IDs', () => {
    expect(
      parseYouTubeInput('https://www.youtube.com/watch?v=JGwWNGJdvx8').videoId
    ).toBe('JGwWNGJdvx8');
    expect(
      parseYouTubeInput('https://youtu.be/7wtfhZwyrcc?si=abc').videoId
    ).toBe('7wtfhZwyrcc');
    const ytm = parseYouTubeInput(
      'https://music.youtube.com/watch?v=JGwWNGJdvx8&list=PL12345'
    );
    expect(ytm.videoId).toBe('JGwWNGJdvx8');
    expect(ytm.playlistId).toBe('PL12345');
    expect(ytm.isYouTubeMusic).toBe(true);
    expect(parseYouTubeInput('JGwWNGJdvx8').videoId).toBe('JGwWNGJdvx8');
  });

  it('finds requested songs in catalog for voice queries', () => {
    const humMatches = searchLocalCatalog('Hum', DEFAULT_CATALOG);
    expect(humMatches.length).toBeGreaterThan(0);
    expect(humMatches[0].title.toLowerCase()).toContain('hum');

    const shapeMatches = searchLocalCatalog('Shape of You', DEFAULT_CATALOG);
    expect(shapeMatches[0].youtubeId).toBe('JGwWNGJdvx8');

    const believerMatches = searchLocalCatalog('Believer', DEFAULT_CATALOG);
    expect(believerMatches[0].youtubeId).toBe('7wtfhZwyrcc');

    const relaxingMatches = searchLocalCatalog(
      'something relaxing',
      DEFAULT_CATALOG
    );
    expect(relaxingMatches.length).toBeGreaterThan(0);
    expect(relaxingMatches[0].category).toBe('relaxing');
  });
});
