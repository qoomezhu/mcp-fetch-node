import { createLRU } from 'lru.min';
import type { ProcessedResult } from './process-url.js';

// TODO: make this configurable
export const cache = createLRU<string, ProcessedResult>({ max: 50 });
