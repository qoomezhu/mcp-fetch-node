import TurndownService from 'turndown';
// @ts-expect-error : missing types
import turndownPluginGfm from 'turndown-plugin-gfm';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/restrict-template-expressions */

export class ConverterError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ConverterError';
  }
}

export class Converter {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      hr: '\n',
    });

    const tables = turndownPluginGfm.tables as TurndownService.Plugin;
    this.turndownService.use(tables);

    this.turndownService.addRule('pre', {
      filter: 'pre',
      replacement: (content) => {
        return `\`\`\`\n${content}\n\`\`\``;
      },
    });

    this.turndownService.addRule('a', {
      filter: 'a',
      replacement: (_content, node) => {
        if (node.href && /^\/?#.*$/.test(node.href as string)) {
          return node.innerText.trim() as string;
        }

        return node.href && node.innerText.trim()
          ? `[${node.innerText.trim()}](${node.href})`
          : '';
      },
    });
  }

  toMarkdown(html: string): string {
    try {
      return this.turndownService.turndown(html);
    } catch (error) {
      throw new ConverterError('Failed to convert HTML to Markdown', error);
    }
  }
}
