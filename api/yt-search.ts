import type { IncomingMessage, ServerResponse } from 'node:http';

function extractVideosFromYoutubeiJson(data: unknown, maxItems = 18) {
  const results: Array<{
    id: string;
    youtubeId: string;
    title: string;
    artist: string;
    thumbnail: string;
    durationText?: string;
    category: 'custom';
  }> = [];
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
      if (results.length < maxItems) walk(val);
    }
  }

  walk(data);
  return results;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const urlObj = new URL(req.url || '', 'http://localhost');
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
    res.end(JSON.stringify({ items: [] }));
  }
}
