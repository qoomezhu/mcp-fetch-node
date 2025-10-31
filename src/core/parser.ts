import { parseHTML } from 'linkedom';
import sanitizeHtml from 'sanitize-html';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

export class ParserError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ParserError';
  }
}

const nodesToRemove = [
  'template',
  'img',
  'svg',
  'nav',
  'footer',
  'header',
  'head',
  'button',
  'form',
  'input',
  'textarea',
  'select',
];

export class Parser {
  extract(html: string): string {
    try {
      let sanitized = sanitizeHtml(html, {
        allowedTags: [
          'html',
          'body',
          ...sanitizeHtml.defaults.allowedTags,
          ...nodesToRemove,
        ],
        allowedAttributes: {
          '*': ['hidden', 'class', 'type', 'aria-hidden', 'href'],
        },
        disallowedTagsMode: 'completelyDiscard',
      });

      const { document } = parseHTML(sanitized);

      document
        .querySelectorAll(
          [
            '[hidden]',
            '[aria-hidden]',
            '[type="button"]',
            '.hide',
            '.hide-sm',
            '.sr-only',
            '.d-none',
            '.d-sm-none',
            '.toc',
            ...nodesToRemove,
          ].join(', '),
        )
        ?.forEach((node: any) => node.remove());

      document.querySelectorAll('ul, table').forEach((node: any) => {
        const list = node.cloneNode(true);
        list.querySelectorAll('a').forEach((child: any) => {
          child.innerHTML = '';
        });
        const htmlLength = list.innerHTML.length;
        const textLength = list.innerText.length;
        if (textLength / htmlLength < 0.2) node.remove();
      });

      document.querySelectorAll('a').forEach((anchor: any) => {
        if (anchor.textContent.trim() === '') {
          anchor.remove();
        }
      });

      sanitized = sanitizeHtml(document.documentElement.innerHTML as string, {
        allowedAttributes: { a: ['href'] },
      });

      return sanitized;
    } catch (error) {
      if (error instanceof ParserError) {
        throw error;
      }
      throw new ParserError('Failed to extract content', error);
    }
  }
}
