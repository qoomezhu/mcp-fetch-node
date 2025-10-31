import { configSchema, AppConfig } from './schema.js';
import { ConfigLoader } from '../infrastructure/config/loader.js';
import { parseArgs } from '../infrastructure/cli/args.js';

let cachedConfig: AppConfig | null = null;

export interface ConfigOptions {
  cliArgs?: string[];
}

export function loadConfig(options: ConfigOptions = {}): AppConfig {
  const loader = new ConfigLoader();

  const defaults: AppConfig = {
    port: 8080,
    'ignore-robots-txt': false,
    'cache-max-size': 50,
  };

  const fileConfig = loader.loadFromFile();
  const envConfig = loader.loadFromEnv();
  const cliConfig = loader.loadFromCli(parseArgs(options.cliArgs));

  const merged = loader.merge(defaults, fileConfig, envConfig, cliConfig);
  const normalized = loader.normalizeConfig(merged);

  cachedConfig = configSchema.parse(normalized);

  return cachedConfig;
}

export function getConfig(): AppConfig {
  cachedConfig ??= loadConfig();
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}
