import { Parser } from 'htmlparser2';
import sanitizeHtml from 'sanitize-html';
import { ExtractError } from './extract.js';

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
  'script',
  'style',
];

export async function* extractStream(
  chunks: AsyncGenerator<string>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const htmlChunks: string[] = [];
  let inRemovableTag = 0;
  const tagStack: string[] = [];

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (signal?.aborted) {
          parser.end();
          return;
        }

        tagStack.push(name);

        if (nodesToRemove.includes(name.toLowerCase())) {
          inRemovableTag++;
          return;
        }

        if (
          attribs.hidden !== undefined ||
          attribs['aria-hidden'] !== undefined ||
          attribs.type === 'button' ||
          attribs.class?.includes('hide') ||
          attribs.class?.includes('sr-only') ||
          attribs.class?.includes('d-none') ||
          attribs.class?.includes('toc')
        ) {
          inRemovableTag++;
          return;
        }

        if (inRemovableTag === 0) {
          let tag = `<${name}`;
          if (name === 'a' && attribs.href) {
            tag += ` href="${attribs.href}"`;
          }
          tag += '>';
          htmlChunks.push(tag);
        }
      },

      ontext(text) {
        if (signal?.aborted) {
          parser.end();
          return;
        }

        if (inRemovableTag === 0 && text.trim()) {
          htmlChunks.push(text);
        }
      },

      onclosetag(name) {
        if (signal?.aborted) {
          parser.end();
          return;
        }

        const lastTag = tagStack.pop();
        if (lastTag !== name && lastTag) {
          tagStack.push(lastTag);
        }

        if (nodesToRemove.includes(name.toLowerCase())) {
          inRemovableTag = Math.max(0, inRemovableTag - 1);
          return;
        }

        const currentTag = tagStack[tagStack.length - 1];
        if (
          currentTag &&
          (currentTag.includes('hide') ||
            currentTag.includes('sr-only') ||
            currentTag.includes('d-none'))
        ) {
          inRemovableTag = Math.max(0, inRemovableTag - 1);
          return;
        }

        if (inRemovableTag === 0) {
          htmlChunks.push(`</${name}>`);
        }
      },
    },
    { decodeEntities: true },
  );

  try {
    for await (const chunk of chunks) {
      if (signal?.aborted) {
        throw new ExtractError('Extraction aborted');
      }

      parser.write(chunk);

      if (htmlChunks.length > 100) {
        const accumulated = htmlChunks.join('');
        htmlChunks.length = 0;
        yield accumulated;
      }
    }

    parser.end();

    if (htmlChunks.length > 0) {
      yield htmlChunks.join('');
    }
  } catch (error) {
    if (error instanceof ExtractError) {
      throw error;
    }
    throw new ExtractError('Failed to extract content from stream', error);
  }
}

export async function extractStreamToString(
  chunks: AsyncGenerator<string>,
  signal?: AbortSignal,
): Promise<string> {
  const htmlParts: string[] = [];

  try {
    for await (const chunk of extractStream(chunks, signal)) {
      if (signal?.aborted) {
        throw new ExtractError('Extraction aborted');
      }
      htmlParts.push(chunk);
    }

    const fullHtml = htmlParts.join('');

    const sanitized = sanitizeHtml(fullHtml, {
      allowedAttributes: { a: ['href'] },
    });

    return sanitized;
  } catch (error) {
    if (error instanceof ExtractError) {
      throw error;
    }
    throw new ExtractError('Failed to extract content from stream', error);
  }
}
