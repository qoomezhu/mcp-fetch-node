import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CliArgs } from '../cli/args.js';

export interface ConfigSource {
  port?: number | string;
  'user-agent'?: string;
  'ignore-robots-txt'?: boolean | string;
  'cache-max-size'?: number | string;
}

export class ConfigLoader {
  private readonly searchPaths = [
    './config.json',
    './config.yaml',
    './config.yml',
  ];

  loadFromFile(): ConfigSource {
    for (const path of this.searchPaths) {
      try {
        const fullPath = resolve(path);
        const content = readFileSync(fullPath, 'utf-8');

        if (path.endsWith('.json')) {
          return JSON.parse(content) as ConfigSource;
        } else if (path.endsWith('.yaml') || path.endsWith('.yml')) {
          return parseYaml(content) as ConfigSource;
        }
      } catch {
        continue;
      }
    }
    return {};
  }

  loadFromEnv(): ConfigSource {
    const config: ConfigSource = {};
    const prefix = 'MCP_FETCH_';

    if (process.env[`${prefix}PORT`]) {
      config.port = process.env[`${prefix}PORT`];
    }

    if (process.env[`${prefix}USER_AGENT`]) {
      config['user-agent'] = process.env[`${prefix}USER_AGENT`];
    }

    if (process.env[`${prefix}IGNORE_ROBOTS_TXT`]) {
      config['ignore-robots-txt'] =
        process.env[`${prefix}IGNORE_ROBOTS_TXT`] === 'true';
    }

    if (process.env[`${prefix}CACHE_MAX_SIZE`]) {
      config['cache-max-size'] = process.env[`${prefix}CACHE_MAX_SIZE`];
    }

    return config;
  }

  loadFromCli(cliArgs: CliArgs): ConfigSource {
    const config: ConfigSource = {};

    if (typeof cliArgs.port === 'string') {
      config.port = cliArgs.port;
    }

    if (typeof cliArgs['user-agent'] === 'string') {
      config['user-agent'] = cliArgs['user-agent'];
    }

    if (typeof cliArgs['ignore-robots-txt'] === 'boolean') {
      config['ignore-robots-txt'] = cliArgs['ignore-robots-txt'];
    }

    if (typeof cliArgs['cache-max-size'] === 'string') {
      config['cache-max-size'] = cliArgs['cache-max-size'];
    }

    return config;
  }

  merge(...sources: ConfigSource[]): ConfigSource {
    const merged: ConfigSource = {};

    for (const source of sources) {
      if (source.port !== undefined) merged.port = source.port;
      if (source['user-agent'] !== undefined)
        merged['user-agent'] = source['user-agent'];
      if (source['ignore-robots-txt'] !== undefined)
        merged['ignore-robots-txt'] = source['ignore-robots-txt'];
      if (source['cache-max-size'] !== undefined)
        merged['cache-max-size'] = source['cache-max-size'];
    }

    return merged;
  }

  normalizeConfig(config: ConfigSource): ConfigSource {
    const normalized: ConfigSource = { ...config };

    if (typeof normalized.port === 'string') {
      normalized.port = parseInt(normalized.port, 10);
    }

    if (typeof normalized['ignore-robots-txt'] === 'string') {
      normalized['ignore-robots-txt'] =
        normalized['ignore-robots-txt'] === 'true';
    }

    if (typeof normalized['cache-max-size'] === 'string') {
      normalized['cache-max-size'] = parseInt(
        normalized['cache-max-size'],
        10,
      );
    }

    return normalized;
  }
}
