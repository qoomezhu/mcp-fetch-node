import { getRequestManager } from '../services/index.js';

export class FetchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'FetchError';
  }
}

export interface FetchResult {
  content: string;
  contentType: string | null;
  byteLength: number;
  raw: Uint8Array;
  charset: string | null;
}

function extractCharset(contentType: string | null) {
  if (!contentType) {
    return null;
  }
  const match = /charset=([^;]+)/i.exec(contentType);
  if (match?.[1]) {
    return match[1].trim().toLowerCase();
  }
  return null;
}

function normalizeCharset(charset: string | null) {
  if (!charset) {
    return 'utf-8';
  }

  const normalized = charset.toLowerCase();
  if (normalized === 'utf8') {
    return 'utf-8';
  }
  if (normalized === 'iso-8859-1') {
    return 'latin1';
  }
  return normalized;
}

function decodeBody(raw: Uint8Array, charset: string | null) {
  const effectiveCharset = normalizeCharset(charset);
  try {
    const decoder = new TextDecoder(effectiveCharset, { fatal: false });
    return decoder.decode(raw);
  } catch (error) {
    if (process.env.NODE_ENV === 'test') {
      void error;
    }
    const fallbackDecoder = new TextDecoder('utf-8', { fatal: false });
    return fallbackDecoder.decode(raw);
  }
}

export async function fetch(url: string, userAgent: string): Promise<FetchResult> {
  const requestManager = getRequestManager();

  return requestManager.execute(async () => {
    try {
      const response = await global.fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': userAgent },
      });

      if (!response.ok) {
        throw new FetchError(
          `Failed to fetch ${url} - status code ${response.status.toString()}`,
        );
      }

      const contentType = response.headers.get('content-type');
      const charset = extractCharset(contentType);
      const arrayBuffer = await response.arrayBuffer();
      const raw = new Uint8Array(arrayBuffer);
      const content = decodeBody(raw, charset);

      return {
        content,
        contentType,
        byteLength: raw.byteLength,
        raw,
        charset,
      } satisfies FetchResult;
    } catch (error) {
      if (error instanceof FetchError) {
        throw error;
      }
      throw new FetchError(`Failed to fetch ${url}`, error);
    }
  });
}
