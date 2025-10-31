import { config } from '../config/config.js';
import { configureConnectionPool } from './connection-pool.js';
import { RequestManager } from './request-manager.js';

let requestManager: RequestManager | null = null;

export function initializeServices(): void {
  if (requestManager) {
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
