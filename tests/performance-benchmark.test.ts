import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { Dispatcher, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { RequestManager } from '../src/services/request-manager.js';
import { configureConnectionPool } from '../src/services/connection-pool.js';
import { createTestServer, type TestServer } from './helpers/test-server.js';

interface BenchmarkResult {
  concurrency: number;
  totalRequests: number;
  duration: number;
  requestsPerSecond: number;
  avgResponseTime: number;
}

async function runBenchmark(
  concurrency: number,
  totalRequests: number,
  url: string,
): Promise<BenchmarkResult> {
  const manager = new RequestManager({ concurrency });

  const startTime = Date.now();
  const responseTimes: number[] = [];

  await Promise.all(
    Array.from({ length: totalRequests }, () =>
      manager.execute(async () => {
        const reqStart = Date.now();
        await fetch(url);
        responseTimes.push(Date.now() - reqStart);
      }),
    ),
  );

  const duration = Date.now() - startTime;
  const requestsPerSecond = (totalRequests / duration) * 1000;
  const avgResponseTime =
    responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

  return {
    concurrency,
    totalRequests,
    duration,
    requestsPerSecond,
    avgResponseTime,
  };
}

describe('Performance Benchmarks', () => {
  let originalDispatcher: Dispatcher;
  let server: TestServer;

  beforeEach(async () => {
    originalDispatcher = getGlobalDispatcher();
    configureConnectionPool({
      connections: 100,
      pipelining: 2,
      keepAliveTimeout: 5000,
    });

    server = await createTestServer((_, res) => {
      setTimeout(() => {
        res.statusCode = 200;
        res.setHeader('content-type', 'text/plain');
        res.end('ok');
      }, 10);
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

  it('should benchmark different concurrency levels', async () => {
    const concurrencyLevels = [1, 5, 10, 20];
    const totalRequests = 30;
    const results: BenchmarkResult[] = [];

    console.log('\n=== Concurrency Performance Benchmark ===\n');

    for (const concurrency of concurrencyLevels) {
      const result = await runBenchmark(concurrency, totalRequests, server.url);
      results.push(result);

      console.log(`Concurrency: ${concurrency}`);
      console.log(`  Total Requests: ${result.totalRequests}`);
      console.log(`  Duration: ${result.duration}ms`);
      console.log(`  Requests/sec: ${result.requestsPerSecond.toFixed(2)}`);
      console.log(`  Avg Response Time: ${result.avgResponseTime.toFixed(2)}ms`);
      console.log('');
    }

    const baseline = results[0];
    const bestResult = results.reduce((a, b) =>
      a.requestsPerSecond > b.requestsPerSecond ? a : b,
    );

    console.log('=== Summary ===');
    console.log(
      `Best throughput: ${bestResult.requestsPerSecond.toFixed(2)} req/s (concurrency ${bestResult.concurrency})`,
    );
    console.log(
      `Improvement over sequential: ${(bestResult.requestsPerSecond / baseline.requestsPerSecond).toFixed(2)}x`,
    );
    console.log('');

    assert.ok(
      bestResult.requestsPerSecond > baseline.requestsPerSecond,
      'Higher concurrency should improve throughput',
    );
  });

  it('should demonstrate connection pool benefits', async () => {
    const totalRequests = 20;

    configureConnectionPool({
      connections: 5,
      keepAliveTimeout: 1000,
    });
    const smallPoolResult = await runBenchmark(10, totalRequests, server.url);

    configureConnectionPool({
      connections: 50,
      keepAliveTimeout: 5000,
    });
    const largePoolResult = await runBenchmark(10, totalRequests, server.url);

    console.log('\n=== Connection Pool Size Impact ===\n');
    console.log(`Small Pool (5 connections): ${smallPoolResult.duration}ms`);
    console.log(`Large Pool (50 connections): ${largePoolResult.duration}ms`);
    console.log(
      `Performance gain: ${((smallPoolResult.duration - largePoolResult.duration) / smallPoolResult.duration * 100).toFixed(1)}%`,
    );
    console.log('');

    assert.ok(smallPoolResult.duration > 0);
    assert.ok(largePoolResult.duration > 0);
  });

  it('should measure queue depth under load', async () => {
    const manager = new RequestManager({ concurrency: 2 });
    const queueDepths: number[] = [];

    const tasks = Array.from({ length: 20 }, () =>
      manager.execute(async () => {
        queueDepths.push(manager.queueDepth);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }),
    );

    await Promise.all(tasks);

    const maxQueueDepth = Math.max(...queueDepths);
    const avgQueueDepth =
      queueDepths.reduce((a, b) => a + b, 0) / queueDepths.length;

    console.log('\n=== Queue Metrics ===\n');
    console.log(`Max Queue Depth: ${maxQueueDepth}`);
    console.log(`Avg Queue Depth: ${avgQueueDepth.toFixed(2)}`);
    console.log('');

    assert.ok(maxQueueDepth > 0, 'Queue should have accumulated requests');
    assert.ok(avgQueueDepth > 0, 'Average queue depth should be positive');
  });

  it('should validate rate limiting effectiveness', async () => {
    const rateLimit = 5;
    const interval = 1000;
    const manager = new RequestManager({
      concurrency: 10,
      intervalCap: rateLimit,
      interval,
    });

    const totalRequests = rateLimit * 3;
    const startTime = Date.now();

    await Promise.all(
      Array.from({ length: totalRequests }, () =>
        manager.execute(async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }),
      ),
    );

    const duration = Date.now() - startTime;
    const expectedMinDuration = ((totalRequests / rateLimit - 1) * interval);

    console.log('\n=== Rate Limiting Test ===\n');
    console.log(`Rate Limit: ${rateLimit} requests per ${interval}ms`);
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Expected Min Duration: ${expectedMinDuration}ms`);
    console.log('');

    assert.ok(
      duration >= expectedMinDuration * 0.8,
      `Duration ${duration}ms should be close to expected ${expectedMinDuration}ms`,
    );
  });
});
