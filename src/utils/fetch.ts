import { Fetcher, FetchError } from '../core/fetcher.js';

export { FetchError };

const fetcher = new Fetcher();

export async function fetch(
  url: string,
  userAgent: string,
): Promise<{ content: string; contentType: string | null }> {
  return fetcher.fetch(url, userAgent);
}
