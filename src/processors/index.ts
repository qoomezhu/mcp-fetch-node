import { PluginRegistry } from '../core/plugin.js';
import { HtmlProcessor } from './html-processor.js';

export function registerDefaultProcessors(registry: PluginRegistry): void {
  registry.register(new HtmlProcessor());
}
