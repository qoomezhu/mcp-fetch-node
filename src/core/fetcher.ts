export class FetchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'FetchError';
  }
}

export interface FetchResult {
  content: string;
  contentType: string | null;
}

export class Fetcher {
  async fetch(url: string, userAgent: string): Promise<FetchResult> {
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

      return {
        content: await response.text(),
        contentType: response.headers.get('content-type'),
      };
    } catch (error) {
      if (error instanceof FetchError) {
        throw error;
      }
      throw new FetchError(`Failed to fetch ${url}`, error);
    }
  }
}
