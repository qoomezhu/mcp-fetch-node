import { config } from '../config/config.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { configureConnectionPool } from './connection-pool.js';
import { RequestManager } from './request-manager.js';

let requestManager: RequestManager | null = null;
let circuitBreaker: CircuitBreaker | null = null;

export function initializeServices(): void {
  if (requestManager && circuitBreaker) {
    return;
  }

  configureConnectionPool({
    connections: config['pool-connections'],
    pipelining: config['pool-pipelining'],
    keepAliveTimeout: config['pool-keepalive-timeout'],
    keepAliveMaxTimeout: config['pool-keepalive-max-timeout'],
    connectTimeout: config['pool-connect-timeout'],
    bodyTimeout: config['pool-body-timeout'],
    headersTimeout: config['pool-headers-timeout'],
  });

  requestManager = new RequestManager({
    concurrency: config.concurrency,
    timeout: config['queue-timeout'],
    intervalCap: config['rate-limit'],
    interval: config['rate-interval'],
  });

  circuitBreaker = new CircuitBreaker({
    failureThreshold: config['circuit-breaker-threshold'],
    cooldownPeriod: config['circuit-breaker-cooldown'],
    halfOpenMaxAttempts: 3,
  });
}

export function getRequestManager(): RequestManager {
  if (!requestManager) {
    initializeServices();
  }

  if (!requestManager) {
    throw new Error('Services could not be initialized.');
  }

  return requestManager;
}

export function getCircuitBreaker(): CircuitBreaker {
  if (!circuitBreaker) {
    initializeServices();
  }

  if (!circuitBreaker) {
    throw new Error('Services could not be initialized.');
  }

  return circuitBreaker;
}

export interface RequestQueueMetrics {
  active: number;
  queued: number;
  depth: number;
}

export function getRequestQueueMetrics(): RequestQueueMetrics {
  const manager = getRequestManager();

  return {
    active: manager.pending,
    queued: manager.size,
    depth: manager.queueDepth,
  };
}

export * from './request-manager.js';
export * from './connection-pool.js';
export * from './circuit-breaker.js';
