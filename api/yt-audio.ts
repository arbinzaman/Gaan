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
    // Ignore
  }

  return null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const urlObj = new URL(req.url || '', 'http://localhost');
    const videoId = (urlObj.searchParams.get('id') || '').trim();
    if (!videoId) {
      res.statusCode = 400;
      res.end();
      return;
    }

    let streamInfo = audioStreamCache.get(videoId);
    if (!streamInfo || streamInfo.expiresAt <= Date.now()) {
      const fetched = await fetchDirectStreamFromPlayerApi(videoId);
      if (fetched) {
        audioStreamCache.set(videoId, fetched);
        streamInfo = fetched;
      }
    }

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
