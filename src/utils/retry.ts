import { ErrorCode, ErrorType, FetchError } from './errors.js';

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  jitterFactor: 0.3,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.initialDelay * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);

  const jitter = cappedDelay * config.jitterFactor * (Math.random() - 0.5) * 2;

  return Math.max(0, Math.floor(cappedDelay + jitter));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context?: {
    url?: string;
    onRetry?: (attempt: number, error: FetchError, delay: number) => void;
  },
): Promise<T> {
  let lastError: FetchError | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const fetchError =
        error instanceof FetchError
          ? error
          : new FetchError(
              'Unexpected error',
              ErrorCode.FETCH_ERROR,
              ErrorType.RETRYABLE,
              { cause: error },
            );

      lastError = fetchError;

      if (fetchError.type === ErrorType.NON_RETRYABLE) {
        console.error(
          `[Retry] Non-retryable error for ${context?.url ?? 'unknown URL'}: ${fetchError.code}`,
        );
        throw fetchError;
      }

      if (attempt < config.maxRetries) {
        const delay = calculateDelay(attempt, config);

        console.warn(
          `[Retry] Attempt ${String(attempt + 1)}/${String(config.maxRetries)} failed for ${context?.url ?? 'unknown URL'}: ${fetchError.code}. Retrying in ${String(delay)}ms...`,
        );

        context?.onRetry?.(attempt + 1, fetchError, delay);

        await sleep(delay);
      } else {
        console.error(
          `[Retry] All ${String(config.maxRetries)} retries exhausted for ${context?.url ?? 'unknown URL'}: ${fetchError.code}`,
        );
      }
    }
  }

  if (!lastError) {
    throw new FetchError(
      'Unexpected retry state',
      ErrorCode.FETCH_ERROR,
      ErrorType.NON_RETRYABLE,
    );
  }

  throw lastError;
}
