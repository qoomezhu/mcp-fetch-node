import { JsonProcessorOptions } from '../../config/content-processors.js';
import type { ContentProcessor, ProcessorResult, ProcessorContext } from '../types.js';

function looksLikeJson(context: ProcessorContext) {
  const contentType = context.contentType?.toLowerCase() ?? '';
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    return true;
  }
  const trimmed = context.content.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function withinLimit(context: ProcessorContext, options: JsonProcessorOptions) {
  return context.byteLength <= options.maxBytes;
}

function safeParse(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    return { __error: (error as Error).message } as const;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function describeScalar(value: unknown) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    const normalized = value.length > 60 ? `${value.slice(0, 57)}…` : value;
    return `string (${normalized.length} chars)`;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return `${typeof value} (${value.toString()})`;
  }
  if (typeof value === 'boolean') {
    return `boolean (${value.toString()})`;
  }
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  if (typeof value === 'symbol' || typeof value === 'function') {
    return typeof value;
  }
  return 'unknown';
}

function summarizeValue(value: unknown, options: JsonProcessorOptions, depth = 0) {
  if (depth > 2) {
    return '…';
  }

  if (Array.isArray(value)) {
    const types = new Set(
      value.slice(0, options.sampleSize).map((item) => summarizeValue(item, options, depth + 1)),
    );
    const typeSummary = Array.from(types).join(', ') || 'mixed';
    return `array (${value.length} items, sample types: ${typeSummary})`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    const previewKeys = keys.slice(0, options.sampleSize).join(', ');
    const hasMore = keys.length > options.sampleSize ? '…' : '';
    return `object (keys: ${previewKeys}${hasMore})`;
  }

  return describeScalar(value);
}

function buildSummary(value: unknown, options: JsonProcessorOptions) {
  const lines: string[] = [];

  const rootType = Array.isArray(value)
    ? 'array'
    : isPlainObject(value)
      ? 'object'
      : typeof value;

  lines.push(`- Root type: ${rootType}`);

  if (Array.isArray(value)) {
    lines.push(`- Length: ${value.length}`);
    if (value.length > 0) {
      const sample = value.slice(0, Math.min(options.sampleSize, value.length));
      lines.push('- Sample entries:');
      sample.forEach((entry, index) => {
        lines.push(`  - item ${index + 1}: ${summarizeValue(entry, options, 1)}`);
      });
      if (value.length > sample.length) {
        lines.push(`  - … ${value.length - sample.length} more items`);
      }
    }
  } else if (isPlainObject(value)) {
    const keys = Object.keys(value);
    lines.push(`- Keys: ${keys.length}`);
    if (keys.length > 0) {
      lines.push('- Key overview:');
      keys.slice(0, options.sampleSize).forEach((key) => {
        lines.push(`  - ${key}: ${summarizeValue(value[key], options, 1)}`);
      });
      if (keys.length > options.sampleSize) {
        lines.push(`  - … ${keys.length - options.sampleSize} more keys`);
      }
    }
  }

  return { summary: lines.join('\n'), rootType };
}

export function createJsonProcessor(
  options: JsonProcessorOptions,
): ContentProcessor {
  return {
    id: 'json',
    label: 'JSON',
    priority: 90,
    supports(context) {
      if (!options.enabled) {
        return false;
      }
      if (!looksLikeJson(context)) {
        return false;
      }
      return withinLimit(context, options);
    },
    async process(context) {
      if (!withinLimit(context, options)) {
        return null;
      }

      const parsed = safeParse(context.content);
      const parsedIsError = isPlainObject(parsed) && '__error' in parsed;

      if (parsedIsError) {
        const prettyFallback = context.content.slice(0, options.summaryThreshold);
        return {
          content: `Failed to parse JSON document. Showing first ${prettyFallback.length} characters:\n\n\`\`\`json\n${prettyFallback}\n\`\`\``,
          metadata: {
            parserError: (parsed as { __error: string }).__error,
          },
        } satisfies ProcessorResult;
      }

      const pretty = JSON.stringify(parsed, null, 2);
      const lines: string[] = [];

      const includeSummary = pretty.length > options.summaryThreshold;
      const { summary, rootType } = buildSummary(parsed, options);

      if (includeSummary) {
        lines.push('## JSON Summary');
        lines.push(summary);
      }

      lines.push('## JSON Document');
      lines.push('```json');
      lines.push(pretty);
      lines.push('```');

      return {
        content: lines.join('\n\n'),
        metadata: {
          summaryIncluded: includeSummary,
          rootType,
        },
      } satisfies ProcessorResult;
    },
  };
}
