import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface YTVideoResult {
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  thumbnail: string;
  durationText?: string;
  category: 'custom';
}

interface CachedStreamInfo {
  url: string;
  mimeType: string;
  expiresAt: number;
}

const audioStreamCache = new Map<string, CachedStreamInfo>();
let cachedVisitorData: { value: string; expiresAt: number } | null = null;

async function getYouTubeVisitorData(): Promise<string | undefined> {
  if (cachedVisitorData && cachedVisitorData.expiresAt > Date.now()) {
    return cachedVisitorData.value;
  }

  try {
    const vRes = await fetch(
      'https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20250214.01.00',
            },
          },
        }),
      }
    );
    if (vRes.ok) {
      const vData = await vRes.json();
      const visitorData = vData?.responseContext?.visitorData;
      if (typeof visitorData === 'string' && visitorData.length > 5) {
        cachedVisitorData = {
          value: visitorData,
          expiresAt: Date.now() + 30 * 60 * 1000,
        };
        return visitorData;
      }
    }
  } catch {
    // Ignore error
  }
  return undefined;
}

function extractVideosFromYoutubeiJson(data: unknown, maxItems = 25): YTVideoResult[] {
  const results: YTVideoResult[] = [];
  const seen = new Set<string>();

  function walk(node: unknown) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    const obj = node as Record<string, unknown>;
    const renderer = (obj.videoRenderer || obj.playlistVideoRenderer) as
      | Record<string, unknown>
      | undefined;

    if (renderer && typeof renderer === 'object') {
      const videoId = typeof renderer.videoId === 'string' ? renderer.videoId : '';
      if (videoId && !seen.has(videoId)) {
        const titleObj = renderer.title as
          | { runs?: Array<{ text?: string }>; simpleText?: string }
          | undefined;
        const title = titleObj?.runs?.[0]?.text || titleObj?.simpleText || '';

        const ownerObj = (renderer.ownerText ||
          renderer.longBylineText ||
          renderer.shortBylineText) as
          | { runs?: Array<{ text?: string }> }
          | undefined;
        const artist = ownerObj?.runs?.[0]?.text || 'YouTube Music';

        const lengthObj = renderer.lengthText as { simpleText?: string } | undefined;
        const durationText = lengthObj?.simpleText;

        if (title && title !== '[Deleted video]' && title !== '[Private video]') {
          seen.add(videoId);
          results.push({
            id: `yt-${videoId}`,
            youtubeId: videoId,
            title,
            artist,
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            durationText,
            category: 'custom',
          });
        }
      }
    }

    for (const val of Object.values(obj)) {
      if (results.length < maxItems) {
        walk(val);
      }
    }
  }

  walk(data);
  return results;
}

async function fetchDirectStreamFromPlayerApi(
  videoId: string
): Promise<CachedStreamInfo | null> {
  const visitorData = await getYouTubeVisitorData();

  try {
    const res = await fetch(
      'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)',
          ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'IOS',
              clientVersion: '20.03.02',
              deviceMake: 'Apple',
              deviceModel: 'iPhone16,2',
              osName: 'iPhone',
              osVersion: '18.2.1.22C161',
              visitorData,
              hl: 'en',
              gl: 'US',
            },
          },
          videoId,
        }),
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const adaptive: Array<{
      itag?: number;
      url?: string;
      mimeType?: string;
      bitrate?: number;
    }> = Array.isArray(data?.streamingData?.adaptiveFormats)
      ? data.streamingData.adaptiveFormats
      : [];
    const formats: Array<{
      itag?: number;
      url?: string;
      mimeType?: string;
      bitrate?: number;
    }> = Array.isArray(data?.streamingData?.formats)
      ? data.streamingData.formats
      : [];

    const allFormats = [...adaptive, ...formats].filter(
      (f) => typeof f.url === 'string' && f.url.startsWith('http')
    );

    if (allFormats.length === 0) return null;

    // 1. Prefer audio/mp4 (itag 140 / 139) — native AAC audio supported by iPhone Safari & all browsers
    const mp4Audio =
      allFormats.find((f) => f.itag === 140) ||
      allFormats.find((f) => (f.mimeType || '').startsWith('audio/mp4'));

    if (mp4Audio && mp4Audio.url) {
      return {
        url: mp4Audio.url,
        mimeType: 'audio/mp4',
        expiresAt: Date.now() + 25 * 60 * 1000,
      };
    }

    // 2. Fallback to video/mp4 (itag 18)
    const mp4Combined = allFormats.find((f) =>
      (f.mimeType || '').startsWith('video/mp4')
    );
    if (mp4Combined && mp4Combined.url) {
      return {
        url: mp4Combined.url,
        mimeType: 'audio/mp4',
        expiresAt: Date.now() + 25 * 60 * 1000,
      };
    }
  } catch {
    // Ignore error
  }

  return null;
}

async function resolvePlayableAudioStream(
  videoId: string,
  fallbackTitle?: string
): Promise<CachedStreamInfo | null> {
  const cached = audioStreamCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const direct = await fetchDirectStreamFromPlayerApi(videoId);
  if (direct) {
    audioStreamCache.set(videoId, direct);
    return direct;
  }

  // If videoId is a 24/7 live stream or restricted, search by title for a standard recorded track
  if (fallbackTitle && fallbackTitle.trim()) {
    try {
      const cleanTitle = fallbackTitle
        .replace(/radio|live|24\/7/gi, '')
        .trim();
      const searchRes = await fetch(
        'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20250214.01.00',
                hl: 'en',
                gl: 'US',
              },
            },
            query: `${cleanTitle} audio track`,
          }),
        }
      );

      if (searchRes.ok) {
        const json = await searchRes.json();
        const candidates = extractVideosFromYoutubeiJson(json, 6);
        for (const cand of candidates) {
          if (cand.youtubeId === videoId) continue;
          const altStream = await fetchDirectStreamFromPlayerApi(cand.youtubeId);
          if (altStream) {
            audioStreamCache.set(videoId, altStream);
            return altStream;
          }
        }
      }
    } catch {
      // Ignore fallback search error
    }
  }

  return null;
}

function gaanLocalApiPlugin(): Plugin {
  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) => {
    if (!req.url) {
      next();
      return;
    }

    // 0. Native HTML5 Background Audio Stream Proxy (/api/yt-audio?id=...&title=...)
    if (req.url.startsWith('/api/yt-audio')) {
      try {
        const urlObj = new URL(req.url, 'http://localhost');
        const videoId = (urlObj.searchParams.get('id') || '').trim();
        const title = (urlObj.searchParams.get('title') || '').trim();

        if (!videoId) {
          res.statusCode = 400;
          res.end();
          return;
        }

        let streamInfo = await resolvePlayableAudioStream(videoId, title);
        if (!streamInfo) {
          res.statusCode = 404;
          res.end();
          return;
        }

        const MAX_CHUNK = 524287; // 512KB max per request for YouTube CDN
        const rawRange = req.headers.range || '';
        let upstreamRange = `bytes=0-${MAX_CHUNK}`;
        const rangeMatch = rawRange.match(/^bytes=(\d+)-(\d*)$/);
        if (rangeMatch) {
          const start = Number(rangeMatch[1]);
          const requestedEnd = rangeMatch[2] ? Number(rangeMatch[2]) : start + MAX_CHUNK;
          const clampedEnd = Math.min(requestedEnd, start + MAX_CHUNK);
          upstreamRange = `bytes=${start}-${clampedEnd}`;
        }

        const forwardHeaders: Record<string, string> = {
          'User-Agent':
            'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)',
          Range: upstreamRange,
        };

        let upstream = await fetch(streamInfo.url, {
          headers: forwardHeaders,
        });

        // If cached URL expired or returned 403, refresh once
        if (!upstream.ok && upstream.status !== 206) {
          audioStreamCache.delete(videoId);
          streamInfo = await resolvePlayableAudioStream(videoId, title);
          if (streamInfo) {
            upstream = await fetch(streamInfo.url, {
              headers: forwardHeaders,
            });
          }
        }

        if (!upstream.ok && upstream.status !== 206) {
          res.statusCode = 502;
          res.end();
          return;
        }

        res.statusCode = req.headers.range ? upstream.status : 200;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', streamInfo.mimeType);

        const contentLength = upstream.headers.get('content-length');
        if (contentLength) {
          res.setHeader('Content-Length', contentLength);
        }
        const contentRange = upstream.headers.get('content-range');
        if (contentRange) {
          res.setHeader('Content-Range', contentRange);
        }

        if (upstream.body) {
          const nodeStream = Readable.fromWeb(
            upstream.body as unknown as import('node:stream/web').ReadableStream
          );
          req.on('close', () => {
            nodeStream.destroy();
          });
          nodeStream.on('error', () => {
            if (!res.writableEnded) res.end();
          });
          nodeStream.pipe(res);
          return;
        }
      } catch {
        if (!res.headersSent) {
          res.statusCode = 500;
        }
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }
    }

    // 1. Indian English Text-to-Speech Audio Stream (/api/tts?text=...)
    if (req.url.startsWith('/api/tts')) {
      try {
        const urlObj = new URL(req.url, 'http://localhost');
        const text = (urlObj.searchParams.get('text') || '').trim().slice(0, 180);

        if (!text) {
          res.statusCode = 400;
          res.end();
          return;
        }

        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en-IN&q=${encodeURIComponent(
          text
        )}`;
        const ttsRes = await fetch(ttsUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });

        if (ttsRes.ok) {
          const arrayBuf = await ttsRes.arrayBuffer();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.end(Buffer.from(arrayBuf));
          return;
        }
      } catch {
        // Fall through
      }
      res.statusCode = 500;
      res.end();
      return;
    }

    // 2. YouTube Playlist Importer (/api/yt-playlist?list=... or ?q=...)
    if (req.url.startsWith('/api/yt-playlist')) {
      try {
        const urlObj = new URL(req.url, 'http://localhost');
        const listId = (urlObj.searchParams.get('list') || '').trim();
        const query = (urlObj.searchParams.get('q') || '').trim();

        if (listId) {
          const browseId = listId.startsWith('VL') ? listId : `VL${listId}`;
          const browseRes = await fetch(
            'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              },
              body: JSON.stringify({
                context: {
                  client: {
                    clientName: 'WEB',
                    clientVersion: '2.20250214.01.00',
                    hl: 'en',
                    gl: 'US',
                  },
                },
                browseId,
              }),
            }
          );

          if (browseRes.ok) {
            const json = await browseRes.json();
            const items = extractVideosFromYoutubeiJson(json, 35);
            const title =
              json?.metadata?.playlistMetadataRenderer?.title ||
              json?.header?.playlistHeaderRenderer?.title?.simpleText ||
              'YouTube Playlist';

            if (items.length > 0) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ title, items }));
              return;
            }
          }
        }

        const searchTerm = query || `playlist ${listId}`;
        const searchRes = await fetch(
          'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
              context: {
                client: {
                  clientName: 'WEB',
                  clientVersion: '2.20250214.01.00',
                  hl: 'en',
                  gl: 'US',
                },
              },
              query: `${searchTerm} songs lyrics`,
            }),
          }
        );

        if (searchRes.ok) {
          const json = await searchRes.json();
          const items = extractVideosFromYoutubeiJson(json, 20);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              title: query || 'Imported YouTube Mix',
              items,
            })
          );
          return;
        }
      } catch {
        // Fall through
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ title: 'Playlist', items: [] }));
      return;
    }

    // 3. YouTube Song Search Endpoint (/api/yt-search?q=...)
    if (!req.url.startsWith('/api/yt-search')) {
      next();
      return;
    }

    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const rawQuery = (urlObj.searchParams.get('q') || '').trim();
      const embedSafe = urlObj.searchParams.get('embedSafe') === '1';

      if (!rawQuery) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ items: [] }));
        return;
      }

      const searchQuery = embedSafe ? `${rawQuery} lyrics` : rawQuery;

      const ytResponse = await fetch(
        'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20250214.01.00',
                hl: 'en',
                gl: 'US',
              },
            },
            query: searchQuery,
          }),
        }
      );

      if (!ytResponse.ok) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ items: [] }));
        return;
      }

      const json = await ytResponse.json();
      const items = extractVideosFromYoutubeiJson(json, 18);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ items }));
    } catch {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ items }));
    }
  };

  return {
    name: 'gaan-local-api',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), gaanLocalApiPlugin()],
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    port: 5173,
    host: true,
  },
});
