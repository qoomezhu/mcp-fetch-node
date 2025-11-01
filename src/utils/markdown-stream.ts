import { Parser } from 'htmlparser2';
import { ExtractError } from './extract.js';

const SKIP_TAGS = new Set([
  'template',
  'script',
  'style',
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
]);

const HIDDEN_CLASS_SNIPPETS = ['hide', 'sr-only', 'd-none', 'toc'];

interface StackEntry {
  tag: string;
  skip: boolean;
  preserveWhitespace?: boolean;
  formattingSuffix?: string;
  block?: boolean;
  anchorStart?: number;
  anchorHref?: string;
  blockquote?: boolean;
}

interface ListEntry {
  type: 'ul' | 'ol';
  index: number;
}

function hasHiddenAttributes(attribs: Record<string, string | undefined>) {
  if ('hidden' in attribs) return true;
  if ('aria-hidden' in attribs && attribs['aria-hidden'] !== 'false') return true;
  if (attribs.type === 'button') return true;
  const className = attribs.class ?? '';
  if (className) {
    return HIDDEN_CLASS_SNIPPETS.some((snippet) => className.includes(snippet));
  }
  return false;
}

function headingPrefix(tag: string) {
  const level = Number.parseInt(tag.slice(1), 10);
  if (Number.isNaN(level)) return '';
  return '#'.repeat(Math.min(6, Math.max(1, level)));
}

export interface HtmlToMarkdownStreamOptions {
  chunkSize?: number;
  signal?: AbortSignal;
}

export async function* htmlToMarkdownStream(
  source: AsyncGenerator<string>,
  { chunkSize = 16_384, signal }: HtmlToMarkdownStreamOptions = {},
): AsyncGenerator<string> {
  let buffer = '';
  const outputQueue: string[] = [];
  const stack: StackEntry[] = [];
  const listStack: ListEntry[] = [];
  let skipDepth = 0;
  let lastChar = '\n';

  const getBlockquoteDepth = () =>
    stack.reduce((depth, entry) => depth + (entry.blockquote ? 1 : 0), 0);

  const canFlush = () =>
    skipDepth === 0 && stack.findIndex((entry) => entry.anchorHref && entry.anchorStart !== undefined) === -1;

  const pushOutput = (force = false) => {
    if (!buffer) return;
    if (force || (buffer.length >= chunkSize && canFlush())) {
      outputQueue.push(buffer);
      buffer = '';
      lastChar = '\n';
    }
  };

  const ensureNewline = (count = 1) => {
    for (let i = 0; i < count; i += 1) {
      if (lastChar !== '\n') {
        buffer += '\n';
        lastChar = '\n';
      } else if (i === 0) {
        buffer += '\n';
      }
    }
  };

  const ensureDoubleNewline = () => {
    if (buffer === '') return;
    if (buffer.endsWith('\n\n')) return;
    if (buffer.endsWith('\n')) {
      buffer += '\n';
    } else {
      buffer += '\n\n';
    }
    lastChar = '\n';
  };

  const append = (text: string, preserveWhitespace = false) => {
    if (!text) return;

    const depth = getBlockquoteDepth();
    let content = text;

    if (!preserveWhitespace) {
      content = content.replace(/\s+/g, ' ');
      if (!content.trim()) {
        if (lastChar !== ' ' && lastChar !== '\n') {
          buffer += ' ';
          lastChar = ' ';
        }
        return;
      }

      if (lastChar === '\n') {
        content = content.trimStart();
      }

      if (lastChar === ' ') {
        content = content.trimStart();
      }

      if (content.endsWith(' ')) {
        content = content.trimEnd();
      }
    }

    if (depth > 0) {
      const prefix = '> '.repeat(depth);
      content = content.replace(/(^|\n)(?=[^\n])/g, `$1${prefix}`);
    }

    buffer += preserveWhitespace ? content : content;
    lastChar = buffer[buffer.length - 1] ?? lastChar;
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (signal?.aborted) {
          parser.end();
          return;
        }

        const tag = name.toLowerCase();

        if (skipDepth > 0 || SKIP_TAGS.has(tag) || hasHiddenAttributes(attribs)) {
          skipDepth += 1;
          stack.push({ tag, skip: true });
          return;
        }

        const entry: StackEntry = { tag, skip: false };

        switch (tag) {
          case 'p':
          case 'div':
          case 'section':
          case 'article':
          case 'main':
          case 'aside':
            ensureDoubleNewline();
            entry.block = true;
            break;
          case 'br':
            ensureNewline();
            break;
          case 'hr':
            ensureDoubleNewline();
            append('---');
            ensureDoubleNewline();
            break;
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
          case 'h5':
          case 'h6':
            ensureDoubleNewline();
            append(`${headingPrefix(tag)} `, true);
            entry.block = true;
            break;
          case 'strong':
          case 'b':
            append('**', true);
            entry.formattingSuffix = '**';
            break;
          case 'em':
          case 'i':
            append('_', true);
            entry.formattingSuffix = '_';
            break;
          case 'code':
            entry.preserveWhitespace = true;
            append('`', true);
            entry.formattingSuffix = '`';
            break;
          case 'pre':
            ensureDoubleNewline();
            append('```\n', true);
            entry.preserveWhitespace = true;
            entry.formattingSuffix = '\n```';
            entry.block = true;
            break;
          case 'blockquote':
            ensureDoubleNewline();
            entry.blockquote = true;
            entry.block = true;
            break;
          case 'ul':
            ensureDoubleNewline();
            listStack.push({ type: 'ul', index: 0 });
            entry.block = true;
            break;
          case 'ol':
            ensureDoubleNewline();
            listStack.push({ type: 'ol', index: 0 });
            entry.block = true;
            break;
          case 'li': {
            const currentList = listStack[listStack.length - 1];
            ensureNewline();
            if (currentList?.type === 'ol') {
              currentList.index += 1;
              append(`${currentList.index.toString()}. `, true);
            } else {
              append('- ', true);
            }
            entry.block = true;
            break;
          }
          case 'a':
            entry.anchorStart = buffer.length;
            if (typeof attribs.href === 'string') {
              entry.anchorHref = attribs.href;
            }
            break;
          default:
            break;
        }

        stack.push(entry);
      },
      ontext(text) {
        if (signal?.aborted) {
          parser.end();
          return;
        }

        if (skipDepth > 0) {
          return;
        }

        const preserveWhitespace = stack.some((entry) => entry.preserveWhitespace);
        append(text, preserveWhitespace);
        pushOutput();
      },
      onclosetag(name) {
        if (signal?.aborted) {
          parser.end();
          return;
        }

        const entry = stack.pop();
        if (!entry) {
          return;
        }

        if (entry.skip) {
          skipDepth = Math.max(0, skipDepth - 1);
          return;
        }

        if (entry.anchorHref && entry.anchorStart !== undefined) {
          const anchorContent = buffer.slice(entry.anchorStart).trim();
          buffer = buffer.slice(0, entry.anchorStart);
          if (anchorContent) {
            append(`[${anchorContent}](${entry.anchorHref})`, true);
          }
        }

        if (entry.formattingSuffix) {
          append(entry.formattingSuffix, true);
        }

        if (entry.tag === 'ul' || entry.tag === 'ol') {
          listStack.pop();
          ensureDoubleNewline();
        }

        if (entry.tag === 'li') {
          ensureNewline();
        }

        if (entry.tag === 'pre') {
          ensureDoubleNewline();
        }

        pushOutput();
      },
      onerror(error) {
        throw new ExtractError(`Failed to parse HTML stream: ${(error as Error).message}`);
      },
    },
    { decodeEntities: true },
  );

  try {
    for await (const chunk of source) {
      if (signal?.aborted) {
        throw new ExtractError('Markdown streaming aborted');
      }

      parser.write(chunk);

      while (outputQueue.length > 0) {
        yield outputQueue.shift()!;
      }
    }

    parser.end();
    pushOutput(true);

    while (outputQueue.length > 0) {
      yield outputQueue.shift()!;
    }

    if (buffer) {
      yield buffer;
    }
  } catch (error) {
    if (error instanceof ExtractError) {
      throw error;
    }
    throw new ExtractError('Failed to convert HTML stream to Markdown', error);
  }
}

export async function htmlToMarkdownString(
  source: AsyncGenerator<string>,
  options?: HtmlToMarkdownStreamOptions,
): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of htmlToMarkdownStream(source, options)) {
    chunks.push(chunk);
  }
  return chunks.join('');
}
