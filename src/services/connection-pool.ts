import { Agent, setGlobalDispatcher } from 'undici';

export interface ConnectionPoolConfig {
  connections?: number;
  pipelining?: number;
  keepAliveTimeout?: number;
  keepAliveMaxTimeout?: number;
  connectTimeout?: number;
  bodyTimeout?: number;
  headersTimeout?: number;
}

export function configureConnectionPool(config: ConnectionPoolConfig): void {
  const agent = new Agent({
    connections: config.connections ?? 100,
    pipelining: config.pipelining ?? 1,
    keepAliveTimeout: config.keepAliveTimeout ?? 4000,
    keepAliveMaxTimeout: config.keepAliveMaxTimeout ?? 600000,
    connect: {
      timeout: config.connectTimeout ?? 10000,
    },
    bodyTimeout: config.bodyTimeout ?? 300000,
    headersTimeout: config.headersTimeout ?? 300000,
  });

  setGlobalDispatcher(agent);
}
