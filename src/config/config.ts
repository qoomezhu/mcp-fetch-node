import { getConfig, loadConfig, resetConfig } from './service.js';
export type { AppConfig } from './schema.js';

export { loadConfig, getConfig, resetConfig };

export const config = getConfig();
