import { extract } from './extract.js';
import { format } from './format.js';
import { fetch } from './fetch.js';
import { extractMetadata, type Metadata } from './metadata.js';

function isHTML(content: string, contentType?: string | null): boolean {
  if (contentType) return contentType.includes('text/html');
  return /<html[\s>]/i.test(content);
}

export interface ProcessedResult {
  content: string;
  prefix: string;
  metadata: Metadata;
}

export async function processURL(
  url: string,
  userAgent: string,
  raw: boolean,
): Promise<ProcessedResult> {
  const { content, contentType, buffer } = await fetch(url, userAgent);

  const metadata = extractMetadata({
    url,
    content,
    contentType,
    arrayBuffer: buffer,
  });

  if (!raw && isHTML(content, contentType)) {
    const extracted = extract(content);
    const formatted = format(extracted);
    if (!formatted) {
      return {
        content: '<error>Page failed to be simplified from HTML</error>',
        prefix: '',
        metadata,
      };
    }
    return {
      content: formatted,
      prefix: '',
      metadata,
    };
  }

  if (raw) {
    return {
      content,
      prefix: `Here is the raw ${contentType ?? 'unknown'} content:`,
      metadata,
    };
  }

  return {
    content,
    prefix: `Content type ${contentType ?? 'unknown'} cannot be simplified to markdown, but here is the raw content:`,
    metadata,
  };
}
