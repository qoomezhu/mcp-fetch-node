import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { Dispatcher, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { RequestManager } from '../src/services/request-manager.js';
import { configureConnectionPool } from '../src/services/connection-pool.js';
import { createTestServer, type TestServer } from './helpers/test-server.js';

describe('Concurrent Fetch Integration', () => {
  let originalDispatcher: Dispatcher;
  let server: TestServer;

  beforeEach(async () => {
    originalDispatcher = getGlobalDispatcher();
    configureConnectionPool({
      connections: 20,
      pipelining: 2,
      keepAliveTimeout: 5000,
    });

    server = await createTestServer((req, res) => {
      const delay = req.url?.includes('slow') ? 50 : 20;
      setTimeout(() => {
        if (req.url?.includes('error')) {
          res.statusCode = 500;
          res.setHeader('content-type', 'text/plain');
          res.end('error');
          return;
        }

        res.statusCode = 200;
        res.setHeader('content-type', 'text/plain');
        res.end('ok');
      }, delay);
    });
  });

  afterEach(async () => {
    const dispatcher = getGlobalDispatcher();
    if (
      dispatcher &&
      dispatcher !== originalDispatcher &&
      'close' in dispatcher &&
      typeof dispatcher.close === 'function'
    ) {
      dispatcher.close();
    }
    setGlobalDispatcher(originalDispatcher);

    if (server) {
      await server.close();
    }
  });

  it('should handle multiple concurrent fetches with queue', async () => {
    const manager = new RequestManager({ concurrency: 5 });

    const urls = Array.from({ length: 20 }, () => server.url);

    const startTime = Date.now();
    const results = await Promise.all(
      urls.map((url) =>
        manager.execute(async () => {
          const response = await fetch(url);
          return response.ok;
        }),
      ),
    );
    const duration = Date.now() - startTime;

    assert.equal(results.length, 20);
    assert.ok(results.every((r) => r === true));
    console.log(`20 concurrent fetches completed in ${duration}ms`);
  });

  it('should demonstrate throughput improvement with higher concurrency', async () => {
    const urls = Array.from({ length: 10 }, () => `${server.url}/slow`);

    const lowConcurrencyManager = new RequestManager({ concurrency: 1 });
    const startTime1 = Date.now();
    await Promise.all(
      urls.map((url) =>
        lowConcurrencyManager.execute(async () => {
          const response = await fetch(url);
          return response.ok;
        }),
      ),
    );
    const lowConcurrencyDuration = Date.now() - startTime1;

    const highConcurrencyManager = new RequestManager({ concurrency: 5 });
    const startTime2 = Date.now();
    await Promise.all(
      urls.map((url) =>
        highConcurrencyManager.execute(async () => {
          const response = await fetch(url);
          return response.ok;
        }),
      ),
    );
    const highConcurrencyDuration = Date.now() - startTime2;

    console.log(`Low concurrency (1): ${lowConcurrencyDuration}ms`);
    console.log(`High concurrency (5): ${highConcurrencyDuration}ms`);
    console.log(
      `Speedup: ${(lowConcurrencyDuration / highConcurrencyDuration).toFixed(2)}x`,
    );

    assert.ok(
      highConcurrencyDuration <= lowConcurrencyDuration,
      'Higher concurrency should be faster or equal',
    );
  });

  it('should maintain queue metrics during concurrent operations', async () => {
    const manager = new RequestManager({ concurrency: 2 });

    let maxQueueDepth = 0;

    const tasks = Array.from({ length: 10 }, (_, i) =>
      manager.execute(async () => {
        maxQueueDepth = Math.max(maxQueueDepth, manager.queueDepth);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return i;
      }),
    );

    await Promise.all(tasks);

    assert.ok(
      maxQueueDepth > 0,
      'Queue depth should have increased during execution',
    );
    assert.equal(
      manager.queueDepth,
      0,
      'Queue should be empty after completion',
    );
  });

  it('should handle mixed success and failure in concurrent requests', async () => {
    const manager = new RequestManager({ concurrency: 3 });

    const tasks = [
      manager.execute(async () => {
        const response = await fetch(server.url);
        return response.ok;
      }),
      manager.execute(async () => {
        const response = await fetch(`${server.url}/error`);
        if (!response.ok) {
          throw new Error('Request failed');
        }
        return response.ok;
      }),
      manager.execute(async () => {
        const response = await fetch(server.url);
        return response.ok;
      }),
    ];

    const results = await Promise.allSettled(tasks);

    assert.equal(results.length, 3);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.ok(fulfilled.length >= 2, 'At least 2 requests should succeed');
    assert.ok(rejected.length >= 1, 'At least 1 request should fail');
  });

  it('should not deduplicate identical requests', async () => {
    const manager = new RequestManager({ concurrency: 5 });
    let fetchCount = 0;

    const url = server.url;
    const tasks = Array.from({ length: 5 }, () =>
      manager.execute(async () => {
        fetchCount++;
        const response = await fetch(url);
        return response.ok;
      }),
    );

    await Promise.all(tasks);

    assert.equal(
      fetchCount,
      5,
      'All 5 requests should be executed without deduplication',
    );
  });
});
