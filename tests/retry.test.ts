import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { retryWithBackoff, RetryConfig } from '../src/utils/retry.js';
import { ErrorCode, ErrorType, FetchError } from '../src/utils/errors.js';

describe('Retry with Exponential Backoff', () => {
  it('should succeed on first attempt', async () => {
    const fn = mock.fn(() => Promise.resolve('success'));

    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 1000,
      jitterFactor: 0.1,
    });

    assert.strictEqual(result, 'success');
    assert.strictEqual(fn.mock.calls.length, 1);
  });

  it('should retry on retryable errors', async () => {
    let attempts = 0;
    const fn = mock.fn(() => {
      attempts++;
      if (attempts < 3) {
        throw new FetchError(
          'Temporary error',
          ErrorCode.NETWORK_TIMEOUT,
          ErrorType.RETRYABLE,
        );
      }
      return Promise.resolve('success');
    });

    const result = await retryWithBackoff(fn, {
      maxRetries: 3,
      initialDelay: 10,
      maxDelay: 100,
      jitterFactor: 0.1,
    });

    assert.strictEqual(result, 'success');
    assert.strictEqual(fn.mock.calls.length, 3);
  });

  it('should not retry on non-retryable errors', async () => {
    const fn = mock.fn(() => {
      throw new FetchError(
        'Client error',
        ErrorCode.CLIENT_ERROR_4XX,
        ErrorType.NON_RETRYABLE,
        { statusCode: 404 },
      );
    });

    await assert.rejects(
      async () => {
        await retryWithBackoff(fn, {
          maxRetries: 3,
          initialDelay: 10,
          maxDelay: 100,
          jitterFactor: 0.1,
        });
      },
      (error: FetchError) => {
        assert.strictEqual(error.code, ErrorCode.CLIENT_ERROR_4XX);
        return true;
      },
    );

    assert.strictEqual(fn.mock.calls.length, 1);
  });

  it('should exhaust retries and throw last error', async () => {
    const fn = mock.fn(() => {
      throw new FetchError(
        'Persistent error',
        ErrorCode.SERVER_ERROR_5XX,
        ErrorType.RETRYABLE,
        { statusCode: 503 },
      );
    });

    await assert.rejects(
      async () => {
        await retryWithBackoff(fn, {
          maxRetries: 2,
          initialDelay: 10,
          maxDelay: 100,
          jitterFactor: 0.1,
        });
      },
      (error: FetchError) => {
        assert.strictEqual(error.code, ErrorCode.SERVER_ERROR_5XX);
        return true;
      },
    );

    assert.strictEqual(fn.mock.calls.length, 3);
  });

  it('should apply exponential backoff with jitter', async () => {
    const delays: number[] = [];
    let attempts = 0;

    const fn = mock.fn(() => {
      attempts++;
      if (attempts <= 3) {
        throw new FetchError(
          'Error',
          ErrorCode.CONNECTION_ERROR,
          ErrorType.RETRYABLE,
        );
      }
      return Promise.resolve('success');
    });

    const startTime = Date.now();
    await retryWithBackoff(
      fn,
      {
        maxRetries: 3,
        initialDelay: 50,
        maxDelay: 1000,
        jitterFactor: 0.2,
      },
      {
        onRetry: (_attempt, _error, delay) => {
          delays.push(delay);
        },
      },
    );
    const totalTime = Date.now() - startTime;

    assert.strictEqual(delays.length, 3);
    assert.ok(totalTime >= 50);
    assert.ok(delays[0] >= 30 && delays[0] <= 70);
    assert.ok(delays[1] >= 80 && delays[1] <= 140);
    assert.ok(delays[2] >= 160 && delays[2] <= 260);
  });
});
