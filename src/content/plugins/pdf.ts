import { Buffer } from 'node:buffer';
import { PDFParse } from 'pdf-parse';
import { PdfProcessorOptions } from '../../config/content-processors.js';
import type { ContentProcessor, ProcessorContext, ProcessorResult } from '../types.js';

function looksLikePdf(context: ProcessorContext) {
  const contentType = context.contentType?.toLowerCase() ?? '';
  if (contentType.includes('application/pdf')) {
    return true;
  }
  const prefix = context.raw.length > 4 ? Buffer.from(context.raw.slice(0, 4)).toString('ascii') : '';
  return prefix.startsWith('%PDF');
}

function withinLimit(context: ProcessorContext, options: PdfProcessorOptions) {
  return context.byteLength <= options.maxBytes;
}

function normalizeText(text: string) {
  const normalizedLines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .reduce<string[]>((acc, line) => {
      if (line === '' && acc.at(-1) === '') {
        return acc;
      }
      acc.push(line);
      return acc;
    }, []);

  return normalizedLines.join('\n');
}

function toMarkdown(text: string) {
  const paragraphs = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return paragraphs.join('\n\n');
}

async function extractPdfText(buffer: Buffer, pageLimit: number) {
  const parser = new PDFParse({ data: buffer });
  try {
    const baseOptions = { pageJoiner: '' as const };
    const parseOptions = pageLimit > 0 ? { ...baseOptions, first: pageLimit } : baseOptions;
    const textResult = await parser.getText(parseOptions);
    let infoResult: { info?: Record<string, unknown> } | undefined;
    try {
      infoResult = await parser.getInfo();
    } catch {
      infoResult = undefined;
    }
    return { textResult, infoResult };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export function createPdfProcessor(options: PdfProcessorOptions): ContentProcessor {
  return {
    id: 'pdf',
    label: 'PDF',
    priority: 70,
    supports(context) {
      if (!options.enabled) {
        return false;
      }
      if (!looksLikePdf(context)) {
        return false;
      }
      return withinLimit(context, options);
    },
    async process(context) {
      if (!withinLimit(context, options)) {
        return null;
      }

      try {
        const buffer = Buffer.from(context.raw);
        const { textResult, infoResult } = await extractPdfText(buffer, options.pageLimit);
        const text = normalizeText(textResult.text ?? '');

        if (!text.trim()) {
          return {
            content: 'PDF document did not contain extractable text.',
            metadata: {
              pages: textResult.total ?? textResult.pages?.length ?? 0,
            },
          } satisfies ProcessorResult;
        }

        const markdown = toMarkdown(text);
        const header: string[] = ['## PDF Document'];
        if (typeof textResult.total === 'number') {
          header.push(`- Pages processed: ${textResult.total}`);
        }
        const info = infoResult?.info as Record<string, unknown> | undefined;
        const title = typeof info?.Title === 'string' ? info.Title : undefined;
        const author = typeof info?.Author === 'string' ? info.Author : undefined;
        if (title) {
          header.push(`- Title: ${title}`);
        }
        if (author) {
          header.push(`- Author: ${author}`);
        }

        header.push('');
        header.push(markdown);

        return {
          content: header.join('\n'),
          metadata: {
            pages: textResult.total,
            hasText: true,
            title: title ?? undefined,
            author: author ?? undefined,
          },
        } satisfies ProcessorResult;
      } catch (error) {
        return {
          content: `Failed to parse PDF document: ${(error as Error).message}`,
          metadata: {
            error: (error as Error).message,
          },
        } satisfies ProcessorResult;
      }
    },
  };
}
