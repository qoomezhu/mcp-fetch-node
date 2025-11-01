import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import {
  ErrorCode,
  ErrorType,
  FetchError,
  classifyError,
  createHttpError,
} from '../src/utils/errors.js';

describe('Error Handling', () => {
  describe('classifyError', () => {
    it('should classify timeout errors', () => {
      const error = new Error('Request timed out');
      const classified = classifyError(error, 'https://example.com');

      assert.strictEqual(classified.code, ErrorCode.NETWORK_TIMEOUT);
      assert.strictEqual(classified.type, ErrorType.RETRYABLE);
    });

    it('should classify DNS errors', () => {
      const error = new Error('getaddrinfo ENOTFOUND example.com');
      const classified = classifyError(error, 'https://example.com');

      assert.strictEqual(classified.code, ErrorCode.DNS_FAILURE);
      assert.strictEqual(classified.type, ErrorType.NON_RETRYABLE);
    });

    it('should classify connection errors', () => {
      const error = new Error('connect ECONNREFUSED');
      const classified = classifyError(error, 'https://example.com');

      assert.strictEqual(classified.code, ErrorCode.CONNECTION_ERROR);
      assert.strictEqual(classified.type, ErrorType.RETRYABLE);
    });

    it('should classify abort errors', () => {
      const error = new Error('The operation was aborted');
      const classified = classifyError(error, 'https://example.com');

      assert.strictEqual(classified.code, ErrorCode.ABORT_ERROR);
      assert.strictEqual(classified.type, ErrorType.NON_RETRYABLE);
    });

    it('should return FetchError as-is', () => {
      const original = new FetchError(
        'Test error',
        ErrorCode.NETWORK_TIMEOUT,
        ErrorType.RETRYABLE,
      );
      const classified = classifyError(original);

      assert.strictEqual(classified, original);
    });
  });

  describe('createHttpError', () => {
    it('should create 4xx errors as non-retryable', () => {
      const error = createHttpError('https://example.com', 404, 'Not Found');

      assert.strictEqual(error.code, ErrorCode.CLIENT_ERROR_4XX);
      assert.strictEqual(error.type, ErrorType.NON_RETRYABLE);
      assert.strictEqual(error.statusCode, 404);
    });

    it('should create 5xx errors as retryable', () => {
      const error = createHttpError(
        'https://example.com',
        503,
        'Service Unavailable',
      );

      assert.strictEqual(error.code, ErrorCode.SERVER_ERROR_5XX);
      assert.strictEqual(error.type, ErrorType.RETRYABLE);
      assert.strictEqual(error.statusCode, 503);
    });
  });

  describe('FetchError.toUserMessage', () => {
    it('should provide user-friendly message for timeout', () => {
      const error = new FetchError(
        'Timeout',
        ErrorCode.NETWORK_TIMEOUT,
        ErrorType.RETRYABLE,
      );
      const message = error.toUserMessage();

      assert.ok(message.includes('timed out'));
      assert.ok(!message.includes('internal'));
    });

    it('should provide user-friendly message for 4xx errors', () => {
      const error = new FetchError(
        'Not found',
        ErrorCode.CLIENT_ERROR_4XX,
        ErrorType.NON_RETRYABLE,
        { statusCode: 404 },
      );
      const message = error.toUserMessage();

      assert.ok(message.includes('404'));
      assert.ok(message.includes('not found'));
    });

    it('should provide user-friendly message for circuit breaker', () => {
      const error = new FetchError(
        'Circuit open',
        ErrorCode.CIRCUIT_BREAKER_OPEN,
        ErrorType.NON_RETRYABLE,
      );
      const message = error.toUserMessage();

      assert.ok(message.includes('Too many recent failures'));
      assert.ok(!message.includes('circuit'));
    });
  });
});
