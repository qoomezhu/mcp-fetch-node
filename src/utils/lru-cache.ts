import { Cache } from '../core/cache.js';
import { getConfig } from '../config/service.js';

const config = getConfig();

export const cache = new Cache<[string, string]>(config['cache-max-size']);
