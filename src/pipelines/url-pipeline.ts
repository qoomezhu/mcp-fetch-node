import { Fetcher } from '../core/fetcher.js';
import { PluginRegistry } from '../core/plugin.js';
import { ProcessorContext, ProcessorResult } from '../core/plugin.js';
import { Cache } from '../core/cache.js';
import { RobotsChecker } from '../core/robots-checker.js';

export interface PipelineOptions {
  ignoreRobotsTxt?: boolean;
  cacheMaxSize?: number;
}

export class UrlPipeline {
  private fetcher: Fetcher;
  private robotsChecker: RobotsChecker;
  private cache: Cache<ProcessorResult>;

  constructor(
    private registry: PluginRegistry,
    options: PipelineOptions = {},
  ) {
    this.fetcher = new Fetcher();
    this.robotsChecker = new RobotsChecker();
    this.cache = new Cache<ProcessorResult>(options.cacheMaxSize ?? 50);
  }

  private buildCacheKey(
    url: string,
    userAgent: string,
    raw: boolean,
  ): string {
    return `${url}||${userAgent}||${raw.toString()}`;
  }

  async process(
    url: string,
    userAgent: string,
    raw: boolean,
    ignoreRobotsTxt?: boolean,
  ): Promise<ProcessorResult> {
    const cacheKey = this.buildCacheKey(url, userAgent, raw);

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (!ignoreRobotsTxt) {
      await this.robotsChecker.check(url, userAgent);
    }

    const fetchResult = await this.fetcher.fetch(url, userAgent);

    const context: ProcessorContext = {
      url,
      content: fetchResult.content,
      contentType: fetchResult.contentType,
      userAgent,
      raw,
    };

    const processor = this.registry.findProcessor(context);

    let result: ProcessorResult;

    if (processor) {
      result = await processor.process(context);
    } else {
      result = this.fallbackHandler(context);
    }

    this.cache.set(cacheKey, result);

    return result;
  }

  private fallbackHandler(context: ProcessorContext): ProcessorResult {
    if (context.raw) {
      return {
        content: context.content,
        prefix: `Here is the raw ${context.contentType ?? 'unknown'} content:`,
      };
    }

    return {
      content: context.content,
      prefix: `Content type ${context.contentType ?? 'unknown'} cannot be simplified to markdown, but here is the raw content:`,
    };
  }
}
