import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import {
  CircuitBreaker,
  CircuitBreakerState,
} from '../src/services/circuit-breaker.js';
import { ErrorCode, ErrorType, FetchError } from '../src/utils/errors.js';

describe('Circuit Breaker', () => {
  it('should start in CLOSED state', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownPeriod: 1000,
      halfOpenMaxAttempts: 2,
    });

    const state = breaker.getState('https://example.com');
    assert.strictEqual(state, CircuitBreakerState.CLOSED);
  });

  it('should open circuit after threshold failures', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownPeriod: 5000,
      halfOpenMaxAttempts: 2,
    });

    const fn = mock.fn(() => {
      throw new FetchError(
        'Server error',
        ErrorCode.SERVER_ERROR_5XX,
        ErrorType.RETRYABLE,
        { statusCode: 500 },
      );
    });

    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute('https://example.com', fn));
    }

    const state = breaker.getState('https://example.com');
    assert.strictEqual(state, CircuitBreakerState.OPEN);
  });

  it('should reject requests when circuit is OPEN', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownPeriod: 5000,
      halfOpenMaxAttempts: 2,
    });

    const fn = mock.fn(() => {
      throw new FetchError(
        'Error',
        ErrorCode.CONNECTION_ERROR,
        ErrorType.RETRYABLE,
      );
    });

    for (let i = 0; i < 2; i++) {
      await assert.rejects(() => breaker.execute('https://example.com', fn));
    }

    await assert.rejects(
      () => breaker.execute('https://example.com', fn),
      (error: FetchError) => {
        assert.strictEqual(error.code, ErrorCode.CIRCUIT_BREAKER_OPEN);
        return true;
      },
    );
  });

  it('should transition to HALF_OPEN after cooldown', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownPeriod: 100,
      halfOpenMaxAttempts: 2,
    });

    const fn = mock.fn(() => {
      throw new FetchError(
        'Error',
        ErrorCode.SERVER_ERROR_5XX,
        ErrorType.RETRYABLE,
      );
    });

    for (let i = 0; i < 2; i++) {
      await assert.rejects(() => breaker.execute('https://example.com', fn));
    }

    assert.strictEqual(
      breaker.getState('https://example.com'),
      CircuitBreakerState.OPEN,
    );

    await new Promise((resolve) => setTimeout(resolve, 150));

    const successFn = mock.fn(() => Promise.resolve('success'));

    await assert.doesNotReject(() =>
      breaker.execute('https://example.com', successFn),
    );

    assert.strictEqual(
      breaker.getState('https://example.com'),
      CircuitBreakerState.HALF_OPEN,
    );
  });

  it('should close circuit after successful HALF_OPEN attempts', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownPeriod: 100,
      halfOpenMaxAttempts: 3,
    });

    const failFn = mock.fn(() => {
      throw new FetchError(
        'Error',
        ErrorCode.SERVER_ERROR_5XX,
        ErrorType.RETRYABLE,
      );
    });

    for (let i = 0; i < 2; i++) {
      await assert.rejects(() =>
        breaker.execute('https://example.com', failFn),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    const successFn = mock.fn(() => Promise.resolve('success'));

    await breaker.execute('https://example.com', successFn);
    assert.strictEqual(
      breaker.getState('https://example.com'),
      CircuitBreakerState.HALF_OPEN,
    );

    await breaker.execute('https://example.com', successFn);
    assert.strictEqual(
      breaker.getState('https://example.com'),
      CircuitBreakerState.CLOSED,
    );
  });

  it('should reopen circuit if HALF_OPEN attempt fails', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownPeriod: 100,
      halfOpenMaxAttempts: 3,
    });

    const failFn = mock.fn(() => {
      throw new FetchError(
        'Error',
        ErrorCode.CONNECTION_ERROR,
        ErrorType.RETRYABLE,
      );
    });

    for (let i = 0; i < 2; i++) {
      await assert.rejects(() =>
        breaker.execute('https://example.com', failFn),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    await assert.rejects(() => breaker.execute('https://example.com', failFn));

    assert.strictEqual(
      breaker.getState('https://example.com'),
      CircuitBreakerState.OPEN,
    );
  });

  it('should isolate circuits per domain', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownPeriod: 5000,
      halfOpenMaxAttempts: 2,
    });

    const failFn = mock.fn(() => {
      throw new FetchError(
        'Error',
        ErrorCode.SERVER_ERROR_5XX,
        ErrorType.RETRYABLE,
      );
    });

    for (let i = 0; i < 2; i++) {
      await assert.rejects(() =>
        breaker.execute('https://example.com/page1', failFn),
      );
    }

    assert.strictEqual(
      breaker.getState('https://example.com/page1'),
      CircuitBreakerState.OPEN,
    );
    assert.strictEqual(
      breaker.getState('https://other.com'),
      CircuitBreakerState.CLOSED,
    );
  });

  it('should not count non-retryable errors towards threshold', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownPeriod: 5000,
      halfOpenMaxAttempts: 2,
    });

    const nonRetryableError = mock.fn(() => {
      throw new FetchError(
        'Not found',
        ErrorCode.CLIENT_ERROR_4XX,
        ErrorType.NON_RETRYABLE,
        { statusCode: 404 },
      );
    });

    for (let i = 0; i < 3; i++) {
      await assert.rejects(() =>
        breaker.execute('https://example.com', nonRetryableError),
      );
    }

    assert.strictEqual(
      breaker.getState('https://example.com'),
      CircuitBreakerState.CLOSED,
    );
  });

  it('should reset circuit', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      cooldownPeriod: 5000,
      halfOpenMaxAttempts: 2,
    });

    breaker.reset('https://example.com');
    assert.strictEqual(
      breaker.getState('https://example.com'),
      CircuitBreakerState.CLOSED,
    );
  });
});
