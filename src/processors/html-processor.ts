import {
  ContentProcessor,
  ProcessorContext,
  ProcessorResult,
} from '../core/plugin.js';
import { Parser } from '../core/parser.js';
import { Converter } from '../core/converter.js';

export class HtmlProcessor implements ContentProcessor {
  readonly name = 'html-processor';
  readonly supportedMimeTypes = ['text/html'];

  private parser = new Parser();
  private converter = new Converter();

  canProcess(context: ProcessorContext): boolean {
    if (context.raw) return false;

    const hasHtmlMime = context.contentType?.includes('text/html') ?? false;
    const hasHtmlContent = context.content.includes('<html');

    return hasHtmlMime || hasHtmlContent;
  }

  process(context: ProcessorContext): ProcessorResult {
    try {
      const extracted = this.parser.extract(context.content);
      const markdown = this.converter.toMarkdown(extracted);

      if (!markdown) {
        return {
          content: '<error>Page failed to be simplified from HTML</error>',
          prefix: '',
        };
      }

      return {
        content: markdown,
        prefix: '',
      };
    } catch {
      return {
        content: '<error>Page failed to be simplified from HTML</error>',
        prefix: '',
      };
    }
  }
}
