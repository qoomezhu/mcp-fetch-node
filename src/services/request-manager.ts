import PQueue from 'p-queue';

export interface RequestManagerConfig {
  concurrency: number;
  timeout?: number;
  intervalCap?: number;
  interval?: number;
  throwOnTimeout?: boolean;
}

export class RequestManager {
  private readonly queue: PQueue;

  constructor(config: RequestManagerConfig) {
    const queueOptions: {
      concurrency: number;
      timeout?: number;
      intervalCap?: number;
      interval?: number;
      throwOnTimeout?: boolean;
    } = {
      concurrency: config.concurrency,
    };

    if (config.timeout !== undefined) {
      queueOptions.timeout = config.timeout;
      queueOptions.throwOnTimeout = config.throwOnTimeout ?? true;
    }

    if (config.intervalCap !== undefined && config.interval !== undefined) {
      queueOptions.intervalCap = config.intervalCap;
      queueOptions.interval = config.interval;
    }

    this.queue = new PQueue(queueOptions);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.add(fn);
  }

  get pending(): number {
    return this.queue.pending;
  }

  get size(): number {
    return this.queue.size;
  }

  get queueDepth(): number {
    return this.queue.pending + this.queue.size;
  }

  get isPaused(): boolean {
    return this.queue.isPaused;
  }

  pause(): void {
    this.queue.pause();
  }

  start(): void {
    this.queue.start();
  }

  clear(): void {
    this.queue.clear();
  }

  async onIdle(): Promise<void> {
    return this.queue.onIdle();
  }
}
