import type { IncomingMessage, ServerResponse } from 'node:http';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const urlObj = new URL(req.url || '', 'http://localhost');
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
    // Ignore error
  }
  res.statusCode = 500;
  res.end();
}
