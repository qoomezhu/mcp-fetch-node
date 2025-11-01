import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { getRequestManager } from '../services/index.js';

function decodeBuffer(buffer: Buffer, charset?: string | null): string {
  const normalized = (charset ?? 'utf-8')
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '')
    .toLowerCase()
    .replace(/_/g, '-');
  const label = normalized === 'utf8' ? 'utf-8' : normalized;
  try {
    return new TextDecoder(label).decode(buffer);
  } catch {
    try {
      return new TextDecoder('utf-8').decode(buffer);
    } catch {
      return buffer.toString('utf8');
    }
  }
}

export class FetchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'FetchError';
  }
}

export async function fetch(
  url: string,
  userAgent: string,
): Promise<{ content: string; contentType: string | null; buffer: Buffer }> {
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
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const lowerContentType = contentType?.toLowerCase() ?? '';

      let content: string;
      if (lowerContentType.includes('pdf')) {
        content = buffer.toString('latin1');
      } else {
        const charsetMatch = contentType
          ? /charset=([^;]+)/i.exec(contentType)
          : null;
        const charset = charsetMatch?.[1] ?? null;
        content = decodeBuffer(buffer, charset);
      }

      return {
        content,
        contentType,
        buffer,
      };
    } catch (error) {
      if (error instanceof FetchError) {
        throw error;
      }
      throw new FetchError(`Failed to fetch ${url}`, error);
    }
  });
}
