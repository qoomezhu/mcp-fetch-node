import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { getGlobalDispatcher, setGlobalDispatcher, Agent, Dispatcher } from 'undici';
import { configureConnectionPool } from '../src/services/connection-pool.js';
import { createTestServer, type TestServer } from './helpers/test-server.js';

describe('Connection Pool', () => {
  let originalDispatcher: Dispatcher;
  let server: TestServer;

  beforeEach(async () => {
    originalDispatcher = getGlobalDispatcher();
    server = await createTestServer((_, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/plain');
      res.end('ok');
    });
  });

  afterEach(async () => {
    const dispatcher = getGlobalDispatcher();
    if (dispatcher && dispatcher !== originalDispatcher && 'close' in dispatcher && typeof dispatcher.close === 'function') {
      dispatcher.close();
    }
    setGlobalDispatcher(originalDispatcher);

    if (server) {
      await server.close();
    }
  });

  it('should configure global dispatcher with custom settings', () => {
    configureConnectionPool({
      connections: 50,
      pipelining: 2,
      keepAliveTimeout: 5000,
    });

    const dispatcher = getGlobalDispatcher();
    assert.ok(dispatcher);
    assert.ok(dispatcher instanceof Agent);
  });

  it('should use default values when not provided', () => {
    configureConnectionPool({});

    const dispatcher = getGlobalDispatcher();
    assert.ok(dispatcher);
    assert.ok(dispatcher instanceof Agent);
  });

  it('should allow multiple fetch requests through the pool', async () => {
    configureConnectionPool({
      connections: 10,
      pipelining: 1,
    });

    const urls = [server.url, server.url, server.url];

    const results = await Promise.all(
      urls.map((url) => fetch(url)),
    );

    assert.equal(results.length, 3);
    for (const response of results) {
      assert.ok(response.ok);
    }
  });
});
