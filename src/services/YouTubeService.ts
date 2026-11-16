import { Track } from '../types/music';

export interface ParsedYouTubeUrl {
  videoId: string | null;
  playlistId: string | null;
  isYouTubeMusic: boolean;
}

export function parseYouTubeInput(input: string): ParsedYouTubeUrl {
  const trimmed = input.trim();
  if (!trimmed) {
    return { videoId: null, playlistId: null, isYouTubeMusic: false };
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return { videoId: trimmed, playlistId: null, isYouTubeMusic: false };
  }

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    const host = url.hostname.toLowerCase();
    const isYouTubeMusic = host === 'music.youtube.com';

    const isYouTubeDomain =
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtu.be' ||
      host === 'www.youtu.be';

    if (!isYouTubeDomain) {
      return { videoId: null, playlistId: null, isYouTubeMusic: false };
    }

    let videoId: string | null = null;
    const playlistId = url.searchParams.get('list');

    if (host.includes('youtu.be')) {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      if (seg && /^[a-zA-Z0-9_-]{11}$/.test(seg)) {
        videoId = seg;
      }
    } else if (url.pathname.startsWith('/watch')) {
      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        videoId = v;
      }
    } else if (
      url.pathname.startsWith('/embed/') ||
      url.pathname.startsWith('/shorts/') ||
      url.pathname.startsWith('/v/')
    ) {
      const seg = url.pathname.split('/').filter(Boolean)[1];
      if (seg && /^[a-zA-Z0-9_-]{11}$/.test(seg)) {
        videoId = seg;
      }
    }

    return { videoId, playlistId, isYouTubeMusic };
  } catch {
    const videoMatch = trimmed.match(
      /(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/
    );
    const listMatch = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    return {
      videoId: videoMatch ? videoMatch[1] : null,
      playlistId: listMatch ? listMatch[1] : null,
      isYouTubeMusic: trimmed.includes('music.youtube.com'),
    };
  }
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export async function fetchYouTubeMetadata(
  videoId: string,
  playlistId?: string | null
): Promise<Track> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const defaultTrack: Track = {
    id: `yt-${videoId}`,
    youtubeId: videoId,
    title: `YouTube Track (${videoId})`,
    artist: 'YouTube Music',
    thumbnail: getYouTubeThumbnail(videoId),
    category: 'custom',
    tags: ['youtube', 'custom'],
    addedAt: Date.now(),
    ...(playlistId ? { playlistId } : {}),
  };

  try {
    const oembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`;
    const response = await fetch(oembedUrl);
    if (response.ok) {
      const data = await response.json();
      if (data && data.title) {
        return {
          ...defaultTrack,
          title: String(data.title),
          artist: String(data.author_name || 'YouTube Artist'),
          thumbnail: String(data.thumbnail_url || getYouTubeThumbnail(videoId)),
          tags: [
            String(data.title).toLowerCase(),
            String(data.author_name || '').toLowerCase(),
            'custom',
          ],
        };
      }
    }
  } catch {
    // Fallback to official youtube oembed
  }

  try {
    const ytOembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
    const response = await fetch(ytOembed);
    if (response.ok) {
      const data = await response.json();
      if (data && data.title) {
        return {
          ...defaultTrack,
          title: String(data.title),
          artist: String(data.author_name || 'YouTube Artist'),
          thumbnail: String(data.thumbnail_url || getYouTubeThumbnail(videoId)),
          tags: [
            String(data.title).toLowerCase(),
            String(data.author_name || '').toLowerCase(),
            'custom',
          ],
        };
      }
    }
  } catch {
    // Fallback to defaultTrack
  }

  return defaultTrack;
}

export function searchLocalCatalog(query: string, tracks: Track[]): Track[] {
  const cleaned = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(something|some|music|song|songs|track|tracks|a|the|for|me|please)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const rawLower = query.toLowerCase().trim();
  const terms = (cleaned || rawLower).split(' ').filter(Boolean);

  if (terms.length === 0 && !rawLower) {
    return tracks;
  }

  const phoneticMap: Record<string, string[]> = {
    hum: ['hum', 'ham', 'hom', 'humm', 'arnob', 'coke studio'],
    ham: ['hum', 'ham'],
    relaxing: ['relaxing', 'relax', 'calm', 'chill', 'lofi', 'peaceful', 'ambient'],
    relax: ['relaxing', 'lofi', 'ambient', 'chill'],
    chill: ['relaxing', 'chill', 'lofi', 'ambient'],
    energetic: ['energetic', 'riding', 'rock', 'workout', 'upbeat'],
    riding: ['riding', 'highway', 'synthwave', 'rock', 'night drive'],
    bangla: ['bangla', 'coke studio', 'arnob'],
  };

  const expandedTerms = new Set<string>(terms);
  for (const term of terms) {
    if (phoneticMap[term]) {
      for (const alias of phoneticMap[term]) {
        expandedTerms.add(alias);
      }
    }
  }

  const scored = tracks.map((track) => {
    let score = 0;
    const titleLower = track.title.toLowerCase();
    const artistLower = track.artist.toLowerCase();
    const categoryLower = (track.category || '').toLowerCase();
    const tagsLower = (track.tags || []).map((t) => t.toLowerCase());

    if (titleLower === rawLower || titleLower === cleaned) {
      score += 120;
    }
    if (titleLower.startsWith(cleaned) && cleaned.length > 0) {
      score += 80;
    }
    if (titleLower.includes(cleaned) && cleaned.length > 0) {
      score += 50;
    }
    if (artistLower.includes(cleaned) && cleaned.length > 0) {
      score += 45;
    }
    if (tagsLower.some((t) => t === rawLower || t === cleaned)) {
      score += 75;
    }

    for (const term of expandedTerms) {
      if (titleLower.split(/\W+/).includes(term)) score += 35;
      else if (titleLower.includes(term)) score += 20;

      if (artistLower.includes(term)) score += 20;
      if (categoryLower === term) score += 30;
      if (tagsLower.some((t) => t === term)) score += 30;
      else if (tagsLower.some((t) => t.includes(term))) score += 15;
    }

    return { track, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track);
}

export async function searchYouTubeOnline(
  query: string,
  apiKey?: string,
  embedSafe = false
): Promise<Track[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // 1. Primary: Local Vite / Preview server JSON YouTube search endpoint
  try {
    const res = await fetch(
      `/api/yt-search?q=${encodeURIComponent(trimmed)}${embedSafe ? '&embedSafe=1' : ''}`
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.items) && data.items.length > 0) {
        return data.items.map(
          (item: {
            id?: string;
            youtubeId: string;
            title: string;
            artist: string;
            thumbnail?: string;
          }): Track => ({
            id: item.id || `yt-${item.youtubeId}`,
            youtubeId: item.youtubeId,
            title: item.title,
            artist: item.artist || 'YouTube Music',
            thumbnail: item.thumbnail || getYouTubeThumbnail(item.youtubeId),
            category: 'custom',
            tags: [trimmed.toLowerCase()],
            addedAt: Date.now(),
          })
        );
      }
    }
  } catch {
    // Fall through if running without Vite middleware
  }

  // 2. Secondary: Optional YouTube Data API v3 key if configured
  if (apiKey && apiKey.trim()) {
    try {
      const endpoint = new URL('https://www.googleapis.com/youtube/v3/search');
      endpoint.searchParams.set('part', 'snippet');
      endpoint.searchParams.set('type', 'video');
      endpoint.searchParams.set('videoEmbeddable', 'true');
      endpoint.searchParams.set('maxResults', '10');
      endpoint.searchParams.set('q', embedSafe ? `${trimmed} lyrics` : trimmed);
      endpoint.searchParams.set('key', apiKey.trim());

      const res = await fetch(endpoint.toString());
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          return data.items
            .filter((item: { id?: { videoId?: string } }) => item?.id?.videoId)
            .map(
              (item: {
                id: { videoId: string };
                snippet: {
                  title: string;
                  channelTitle: string;
                  thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
                };
              }): Track => ({
                id: `yt-${item.id.videoId}`,
                youtubeId: item.id.videoId,
                title: item.snippet.title,
                artist: item.snippet.channelTitle || 'YouTube Music',
                thumbnail:
                  item.snippet.thumbnails?.high?.url ||
                  item.snippet.thumbnails?.medium?.url ||
                  getYouTubeThumbnail(item.id.videoId),
                category: 'custom',
                tags: [trimmed.toLowerCase()],
                addedAt: Date.now(),
              })
            );
        }
      }
    } catch {
      // Ignore error
    }
  }

  return [];
}

export async function fetchYouTubePlaylist(
  inputOrQuery: string
): Promise<{ title: string; tracks: Track[] }> {
  const trimmed = inputOrQuery.trim();
  if (!trimmed) return { title: 'Playlist', tracks: [] };

  const parsed = parseYouTubeInput(trimmed);
  const params = new URLSearchParams();
  if (parsed.playlistId) {
    params.set('list', parsed.playlistId);
  } else {
    params.set('q', trimmed);
  }

  try {
    const res = await fetch(`/api/yt-playlist?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      const tracks: Track[] = rawItems.map(
        (item: {
          id?: string;
          youtubeId: string;
          title: string;
          artist: string;
          thumbnail?: string;
        }): Track => ({
          id: item.id || `yt-${item.youtubeId}`,
          youtubeId: item.youtubeId,
          title: item.title,
          artist: item.artist || 'YouTube Music',
          thumbnail: item.thumbnail || getYouTubeThumbnail(item.youtubeId),
          category: 'custom',
          tags: [trimmed.toLowerCase()],
          addedAt: Date.now(),
        })
      );
      return {
        title: String(data?.title || trimmed || 'YouTube Playlist'),
        tracks,
      };
    }
  } catch {
    // Ignore error
  }

  return { title: trimmed, tracks: [] };
}

export function getYouTubeDesktopWatchUrl(videoId: string, playlistId?: string): string {
  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.set('v', videoId);
  if (playlistId) {
    url.searchParams.set('list', playlistId);
  }
  url.searchParams.set('app', 'desktop');
  return url.toString();
}

export function getYouTubeMusicWatchUrl(videoId: string, playlistId?: string): string {
  const url = new URL('https://music.youtube.com/watch');
  url.searchParams.set('v', videoId);
  if (playlistId) {
    url.searchParams.set('list', playlistId);
  }
  return url.toString();
}

export function getYouTubeSearchExternalUrl(query: string, useMusicSite = false): string {
  if (useMusicSite) {
    const url = new URL('https://music.youtube.com/search');
    url.searchParams.set('q', query);
    return url.toString();
  }
  const url = new URL('https://www.youtube.com/results');
  url.searchParams.set('search_query', query);
  url.searchParams.set('app', 'desktop');
  return url.toString();
}
