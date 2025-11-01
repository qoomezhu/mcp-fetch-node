import { config } from '../config/config.js';
import { streamFetch } from './fetch-stream.js';
import { htmlToMarkdownString } from './markdown-stream.js';

function isHTML(contentType?: string | null): boolean {
  return contentType?.includes('text/html') ?? false;
}

export async function processURLStream(
  url: string,
  userAgent: string,
  raw: boolean,
  signal?: AbortSignal,
): Promise<[string, string]> {
  if (!config['enable-streaming']) {
    const { processURL } = await import('./process-url.js');
    return processURL(url, userAgent, raw);
  }

  const timeout = config['stream-timeout'];

  const { contentType, body } = await streamFetch(url, userAgent, {
    signal,
    timeout,
  });

  if (!raw && isHTML(contentType)) {
    try {
      const markdown = await htmlToMarkdownString(body, {
        chunkSize: config['stream-chunk-size'],
        signal,
      });

      if (!markdown || markdown.trim().length === 0) {
        return ['<error>Page failed to be simplified from HTML</error>', ''];
      }

      return [markdown.trim(), ''];
    } catch (error) {
      console.error('Streaming markdown conversion failed, falling back:', error);
      const { processURL } = await import('./process-url.js');
      const fallback = await processURL(url, userAgent, raw);
      return fallback;
    }
  }

  if (raw) {
    const chunks: string[] = [];
    for await (const chunk of body) {
      chunks.push(chunk);
    }
    const content = chunks.join('');
    const prefix = `Here is the raw ${contentType ?? 'unknown'} content:`;
    return [content, prefix] as [string, string];
  }

  const chunks: string[] = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }
  const content = chunks.join('');
  const prefix = `Content type ${contentType ?? 'unknown'} cannot be simplified to markdown, but here is the raw content:`;

  return [content, prefix] as [string, string];
}
