import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { RequestManager } from '../src/services/request-manager.js';

describe('RequestManager', () => {
  let manager: RequestManager;

  beforeEach(() => {
    manager = new RequestManager({ concurrency: 2 });
  });

  afterEach(async () => {
    manager.clear();
    await manager.onIdle();
  });

  it('should execute tasks sequentially with concurrency limit', async () => {
    const results: number[] = [];
    const tasks = Array.from({ length: 5 }, (_, i) =>
      manager.execute(async () => {
        results.push(i);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return i;
      }),
    );

    await Promise.all(tasks);
    assert.equal(results.length, 5);
    assert.deepEqual(results.sort(), [0, 1, 2, 3, 4]);
  });

  it('should track queue depth correctly', async () => {
    const longTask = () =>
      new Promise((resolve) => setTimeout(resolve, 100));

    const task1 = manager.execute(longTask);
    const task2 = manager.execute(longTask);
    const task3 = manager.execute(longTask);

    assert.ok(manager.queueDepth > 0);

    await Promise.all([task1, task2, task3]);

    await manager.onIdle();
    assert.equal(manager.queueDepth, 0);
  });

  it('should respect concurrency limits', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 10 }, () =>
      manager.execute(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent--;
      }),
    );

    await Promise.all(tasks);
    assert.ok(maxConcurrent <= 2, `Max concurrent was ${maxConcurrent}, expected <= 2`);
  });

  it('should handle task errors without breaking the queue', async () => {
    const results: (string | Error)[] = [];

    const tasks = [
      manager.execute(async () => 'success-1'),
      manager.execute(async () => {
        throw new Error('task-error');
      }),
      manager.execute(async () => 'success-2'),
    ];

    for (const task of tasks) {
      try {
        const result = await task;
        results.push(result);
      } catch (error) {
        results.push(error as Error);
      }
    }

    assert.equal(results.length, 3);
    assert.equal(results[0], 'success-1');
    assert.ok(results[1] instanceof Error);
    assert.equal(results[2], 'success-2');
  });

  it('should support pause and resume', async () => {
    let executed = 0;

    manager.pause();

    const tasks = Array.from({ length: 3 }, () =>
      manager.execute(async () => {
        executed++;
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(executed, 0, 'Tasks should not execute while paused');

    manager.start();
    await Promise.all(tasks);
    assert.equal(executed, 3, 'All tasks should execute after resuming');
  });

  it('should handle rate limiting', async () => {
    const rateLimitedManager = new RequestManager({
      concurrency: 5,
      intervalCap: 2,
      interval: 100,
    });

    const startTime = Date.now();
    const tasks = Array.from({ length: 6 }, (_, i) =>
      rateLimitedManager.execute(async () => i),
    );

    await Promise.all(tasks);
    const duration = Date.now() - startTime;

    assert.ok(duration >= 200, `Duration was ${duration}ms, expected >= 200ms for rate limiting`);
  });

  it('should handle timeout configuration', async () => {
    const timeoutManager = new RequestManager({
      concurrency: 1,
      timeout: 50,
    });

    const task = timeoutManager.execute(
      async () =>
        new Promise((resolve) => setTimeout(resolve, 200)),
    );

    await assert.rejects(task, /timed out/i);
  });

  it('should allow clearing the queue', async () => {
    let executed = 0;

    manager.pause();

    Array.from({ length: 5 }, () =>
      manager.execute(async () => {
        executed++;
      }),
    );

    assert.ok(manager.size > 0);

    manager.clear();

    assert.equal(manager.size, 0);
    assert.equal(executed, 0);
  });
});
