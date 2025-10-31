import { PluginRegistry } from '../core/plugin.js';
import { UrlPipeline } from './url-pipeline.js';
import { registerDefaultProcessors } from '../processors/index.js';
import { loadConfig, getConfig } from '../config/service.js';

let pipeline: UrlPipeline | null = null;

export function getUrlPipeline(): UrlPipeline {
  if (!pipeline) {
    const registry = new PluginRegistry();
    registerDefaultProcessors(registry);

    let config;
    try {
      config = getConfig();
    } catch {
      config = loadConfig();
    }

    pipeline = new UrlPipeline(registry, {
      cacheMaxSize: config['cache-max-size'],
    });
  }

  return pipeline;
}

export function resetPipeline(): void {
  pipeline = null;
}
