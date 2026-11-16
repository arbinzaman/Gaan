import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

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
    // Ignore
  }
  return undefined;
}

async function fetchDirectStreamFromPlayerApi(
  videoId: string
): Promise<CachedStreamInfo | null> {
  const visitorData = await getYouTubeVisitorData();

  const clients = [
    {
      ua: 'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)',
      context: {
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
    {
      ua: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
      context: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.62.27',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        osName: 'Android',
        osVersion: '12L',
        androidSdkVersion: 32,
        visitorData,
        hl: 'en',
        gl: 'US',
      },
    },
    {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      context: {
        clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        clientVersion: '2.0',
        visitorData,
        hl: 'en',
        gl: 'US',
      },
    },
  ];

  for (const client of clients) {
    try {
      const res = await fetch(
        'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': client.ua,
            ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
          },
          body: JSON.stringify({
            context: {
              client: client.context,
              thirdParty: { embedUrl: 'https://www.youtube.com/' },
            },
            videoId,
          }),
        }
      );

      if (!res.ok) continue;
      const data = await res.json();
      const adaptive: Array<{ itag?: number; url?: string; mimeType?: string }> =
        Array.isArray(data?.streamingData?.adaptiveFormats)
          ? data.streamingData.adaptiveFormats
          : [];
      const formats: Array<{ itag?: number; url?: string; mimeType?: string }> =
        Array.isArray(data?.streamingData?.formats)
          ? data.streamingData.formats
          : [];

      const allFormats = [...adaptive, ...formats].filter(
        (f) => typeof f.url === 'string' && f.url.startsWith('http')
      );

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
      // Try next client
    }
  }

  return null;
}

function extractVideoIds(data: unknown, max = 5): string[] {
  const ids: string[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== 'object' || ids.length >= max) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    const vr = obj.videoRenderer as Record<string, unknown> | undefined;
    if (vr && typeof vr.videoId === 'string' && !ids.includes(vr.videoId)) {
      ids.push(vr.videoId);
    }
    for (const v of Object.values(obj)) walk(v);
  }
  walk(data);
  return ids;
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

  if (fallbackTitle && fallbackTitle.trim()) {
    try {
      const cleanTitle = fallbackTitle.replace(/radio|live|24\/7/gi, '').trim();
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
        const candidates = extractVideoIds(json, 5);
        for (const candId of candidates) {
          if (candId === videoId) continue;
          const altStream = await fetchDirectStreamFromPlayerApi(candId);
          if (altStream) {
            audioStreamCache.set(videoId, altStream);
            return altStream;
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const urlObj = new URL(req.url || '', 'http://localhost');
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

    const MAX_CHUNK = 524287;
    const rawRange = req.headers.range || '';
    let upstreamRange = `bytes=0-${MAX_CHUNK}`;
    const rangeMatch = rawRange.match(/^bytes=(\d+)-(\d*)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const requestedEnd = rangeMatch[2] ? Number(rangeMatch[2]) : start + MAX_CHUNK;
      const clampedEnd = Math.min(requestedEnd, start + MAX_CHUNK);
      upstreamRange = `bytes=${start}-${clampedEnd}`;
    }

    const upstream = await fetch(streamInfo.url, {
      headers: {
        'User-Agent':
          'com.google.ios.youtube/20.03.02 (iPhone16,2; U; CPU iOS 18_2_1 like Mac OS X;)',
        Range: upstreamRange,
      },
    });

    if (!upstream.ok && upstream.status !== 206) {
      audioStreamCache.delete(videoId);
      res.statusCode = 502;
      res.end();
      return;
    }

    res.statusCode = req.headers.range ? upstream.status : 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', streamInfo.mimeType);

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    if (upstream.body) {
      const nodeStream = Readable.fromWeb(
        upstream.body as unknown as import('node:stream/web').ReadableStream
      );
      req.on('close', () => nodeStream.destroy());
      nodeStream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      nodeStream.pipe(res);
      return;
    }
  } catch {
    if (!res.headersSent) res.statusCode = 500;
    if (!res.writableEnded) res.end();
  }
}
