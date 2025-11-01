import { getRequestManager } from '../services/index.js';
import { FetchError } from './fetch.js';

export interface StreamingFetchOptions {
  signal?: AbortSignal;
  timeout?: number;
}

export interface StreamingFetchResult {
  contentType: string | null;
  body: AsyncGenerator<string>;
}

export async function streamFetch(
  url: string,
  userAgent: string,
  options: StreamingFetchOptions = {},
): Promise<StreamingFetchResult> {
  const requestManager = getRequestManager();
  const controller = new AbortController();
  const { signal, timeout } = options;

  const abortHandler = () => controller.abort();
  signal?.addEventListener('abort', abortHandler);

  let timeoutId: NodeJS.Timeout | undefined;
  if (timeout) {
    timeoutId = setTimeout(() => controller.abort(), timeout);
  }

  try {
    const response = await requestManager.execute(async () => {
      try {
        const res = await global.fetch(url, {
          redirect: 'follow',
          headers: { 'User-Agent': userAgent },
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new FetchError(
            `Failed to fetch ${url} - status code ${res.status.toString()}`,
          );
        }

        if (!res.body) {
          throw new FetchError(`No response body for ${url}`);
        }

        return res;
      } catch (error) {
        if (error instanceof FetchError) {
          throw error;
        }

        if ((error as Error).name === 'AbortError') {
          throw new FetchError(`Request aborted for ${url}`, error);
        }

        throw new FetchError(`Failed to fetch ${url}`, error);
      }
    });

    const responseBody = response.body;
    if (!responseBody) {
      throw new FetchError(`No response body for ${url}`);
    }

    const reader = responseBody.getReader();
    const decoder = new TextDecoder();

    const stream = (async function* () {
      let cancelled = false;

      try {
        while (true) {
          if (signal?.aborted) {
            throw new FetchError(`Request aborted for ${url}`);
          }

          const { done, value } = await reader.read();

          if (done) {
            const finalChunk = decoder.decode();
            if (finalChunk) {
              yield finalChunk;
            }
            break;
          }

          const text = decoder.decode(value, { stream: true });
          if (text) {
            yield text;
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          cancelled = true;
          throw new FetchError(`Request aborted for ${url}`, error);
        }
        throw error;
      } finally {
        if (!cancelled) {
          await reader.cancel().catch(() => undefined);
        }
        reader.releaseLock();
      }
    })();

    return {
      contentType: response.headers.get('content-type'),
      body: stream,
    };
  } finally {
    signal?.removeEventListener('abort', abortHandler);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function fetchStreamToString(
  url: string,
  userAgent: string,
  options: StreamingFetchOptions = {},
): Promise<{ content: string; contentType: string | null }> {
  const { contentType, body } = await streamFetch(url, userAgent, options);

  const chunks: string[] = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }

  return {
    content: chunks.join(''),
    contentType,
  };
}
