import { config } from '../config/config.js';
import { getCircuitBreaker, getRequestManager } from '../services/index.js';
import { classifyError, createHttpError } from './errors.js';
import { retryWithBackoff } from './retry.js';

export { FetchError } from './errors.js';

export async function fetch(
  url: string,
  userAgent: string,
): Promise<{ content: string; contentType: string | null }> {
  const requestManager = getRequestManager();
  const circuitBreaker = getCircuitBreaker();

  return requestManager.execute(async () => {
    return circuitBreaker.execute(url, async () => {
      return retryWithBackoff(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            controller.abort();
          }, config['request-timeout']);

          try {
            const response = await global.fetch(url, {
              redirect: 'follow',
              headers: { 'User-Agent': userAgent },
              signal: controller.signal,
            });

            if (!response.ok) {
              throw createHttpError(url, response.status, response.statusText);
            }

            return {
              content: await response.text(),
              contentType: response.headers.get('content-type'),
            };
          } catch (error) {
            throw classifyError(error, url);
          } finally {
            clearTimeout(timeoutId);
          }
        },
        {
          maxRetries: config['retry-max-attempts'],
          initialDelay: config['retry-initial-delay'],
          maxDelay: config['retry-max-delay'],
          jitterFactor: 0.3,
        },
        {
          url,
        },
      );
    });
  });
}
