import { createLRU } from 'lru.min';

export class Cache<TValue> {
  private readonly cache;

  constructor(private readonly maxSize: number) {
    this.cache = createLRU<string, TValue>({ max: this.maxSize });
  }

  get(key: string): TValue | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: TValue): void {
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }
}
