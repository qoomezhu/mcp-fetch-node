import { executeProcessors } from '../content/registry.js';
import type { ProcessorContext, ProcessorMetadata } from '../content/types.js';
import { fetch } from './fetch.js';

function buildRawPrefix(
  contentType: string | null,
  errors: Error[],
) {
  const base = `Content type ${contentType ?? 'unknown'} cannot be simplified to markdown, but here is the raw content:`;
  if (errors.length === 0) {
    return base;
  }
  const uniqueMessages = Array.from(new Set(errors.map((error) => error.message)));
  return `${base} (processors failed: ${uniqueMessages.join('; ')})`;
}

function formatMetadata(metadata?: ProcessorMetadata) {
  if (!metadata) {
    return '';
  }
  const lines = Object.entries(metadata)
    .filter(([, value]) =>
      value !== undefined &&
      value !== null &&
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'),
    )
    .map(([key, value]) => `- ${key}: ${String(value)}`);

  if (lines.length === 0) {
    return '';
  }

  return `Metadata:\n${lines.join('\n')}`;
}

export async function processURL(url: string, userAgent: string, raw: boolean) {
  const response = await fetch(url, userAgent);

  if (raw) {
    return [
      response.content,
      `Here is the raw ${response.contentType ?? 'unknown'} content:`,
    ] as const;
  }

  const context: ProcessorContext = {
    url,
    content: response.content,
    contentType: response.contentType,
    charset: response.charset,
    byteLength: response.byteLength,
    raw: response.raw,
  };

  const { result, errors } = await executeProcessors(context);

  if (result) {
    const metadataPrefix = formatMetadata(result.metadata);
    const parts = [metadataPrefix, result.prefix ?? ''].filter(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );
    const prefix = parts.join('\n');
    return [result.content, prefix] as const;
  }

  return [response.content, buildRawPrefix(response.contentType, errors)] as const;
}
