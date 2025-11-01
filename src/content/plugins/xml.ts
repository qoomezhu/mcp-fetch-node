import { XMLParser } from 'fast-xml-parser';
import { XmlProcessorOptions } from '../../config/content-processors.js';
import type { ContentProcessor, ProcessorContext, ProcessorResult } from '../types.js';

function looksLikeXml(context: ProcessorContext) {
  const contentType = context.contentType?.toLowerCase() ?? '';
  if (
    contentType.includes('application/xml') ||
    contentType.includes('text/xml') ||
    contentType.includes('application/rss+xml') ||
    contentType.includes('application/atom+xml')
  ) {
    return true;
  }
  const trimmed = context.content.trimStart();
  return trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed');
}

function withinLimit(context: ProcessorContext, options: XmlProcessorOptions) {
  return context.byteLength <= options.maxBytes;
}

function parseXml(content: string) {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      allowBooleanAttributes: true,
      trimValues: true,
    });
    return parser.parse(content) as unknown;
  } catch (error) {
    return { __error: (error as Error).message } as const;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function extractArray(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function normalizeText(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function summarizeAttributes(node: Record<string, unknown>) {
  const attributes = Object.entries(node)
    .filter(([key]) => key.startsWith('@_'))
    .map(([key, value]) => `${key.slice(2)}="${normalizeText(value)}"`);
  if (attributes.length === 0) {
    return '';
  }
  return ` (${attributes.join(', ')})`;
}

function summarizeFeed(feed: Record<string, unknown>, options: XmlProcessorOptions) {
  const lines: string[] = [];
  const channel = (feed.channel ?? feed) as Record<string, unknown>;
  const title = normalizeText(channel.title);
  const description = normalizeText(channel.description);
  const link = normalizeText(channel.link);

  if (title) {
    lines.push(`# ${title}`);
  }

  if (description) {
    lines.push(description);
  }

  if (link) {
    lines.push(`Source: ${link}`);
  }

  const items = extractArray(channel.item ?? channel.entry);
  if (items.length === 0) {
    return lines.join('\n\n');
  }

  lines.push('');
  lines.push('## Feed Entries');

  const limited = items.slice(0, options.feedItems) as Array<Record<string, unknown>>;

  limited.forEach((item, index) => {
    const itemTitle = normalizeText(item.title ?? item['media:title']);
    const itemLink = normalizeText(item.link?.href ?? item.link);
    const pubDate = normalizeText(item.pubDate ?? item.published ?? item.updated);
    const summary = normalizeText(
      item.description ?? item.summary ?? item['content:encoded'] ?? item.content?.['#text'],
    );

    const header = itemLink && itemTitle ? `[${itemTitle}](${itemLink})` : itemTitle || itemLink;
    const displayTitle = header || `Entry ${index + 1}`;
    lines.push(`${index + 1}. ${displayTitle}`);

    const details: string[] = [];
    if (pubDate) {
      details.push(`Published: ${pubDate}`);
    }
    if (summary) {
      const shortSummary = summary.length > 240 ? `${summary.slice(0, 237)}…` : summary;
      details.push(shortSummary);
    }
    if (details.length > 0) {
      lines.push(`   ${details.join('\n   ')}`);
    }
  });

  if (items.length > limited.length) {
    lines.push(`\n… ${items.length - limited.length} more entries`);
  }

  return lines.join('\n');
}

function convertNode(
  name: string,
  value: unknown,
  options: XmlProcessorOptions,
  depth: number,
  lines: string[],
) {
  const indent = '  '.repeat(depth);

  if (Array.isArray(value)) {
    const maxItems = depth === 0 ? options.feedItems : Math.min(options.feedItems, 8);
    lines.push(`${indent}- ${name} (array, ${value.length} items)`);
    value.slice(0, maxItems).forEach((item, index) => {
      convertNode(`${name}[${index}]`, item, options, depth + 1, lines);
    });
    if (value.length > maxItems) {
      lines.push(`${indent}  - … ${value.length - maxItems} more`);
    }
    return;
  }

  if (isPlainObject(value)) {
    const attributes = summarizeAttributes(value);
    const children = Object.entries(value).filter(([key]) => !key.startsWith('@_'));
    if (children.length === 0) {
      lines.push(`${indent}- ${name}${attributes}`);
      return;
    }
    lines.push(`${indent}- ${name}${attributes}`);
    children.forEach(([childName, childValue]) => {
      convertNode(childName, childValue, options, depth + 1, lines);
    });
    return;
  }

  const text = normalizeText(value);
  const display = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  lines.push(`${indent}- ${name}: ${display}`);
}

function convertGenericXml(root: Record<string, unknown>, options: XmlProcessorOptions) {
  const entries = Object.entries(root);
  const lines: string[] = ['## XML Structure'];

  entries.forEach(([name, value]) => {
    convertNode(name, value, options, 0, lines);
  });

  return lines.join('\n');
}

function isFeedStructure(parsed: unknown) {
  if (!isPlainObject(parsed)) {
    return false;
  }
  if ('rss' in parsed || 'feed' in parsed) {
    return true;
  }
  return false;
}

export function createXmlProcessor(options: XmlProcessorOptions): ContentProcessor {
  return {
    id: 'xml',
    label: 'XML',
    priority: 80,
    supports(context) {
      if (!options.enabled) {
        return false;
      }
      if (!looksLikeXml(context)) {
        return false;
      }
      return withinLimit(context, options);
    },
    async process(context) {
      if (!withinLimit(context, options)) {
        return null;
      }

      const parsed = parseXml(context.content);
      const parsedIsError = isPlainObject(parsed) && '__error' in parsed;

      if (parsedIsError) {
        return {
          content: `Failed to parse XML document: ${(parsed as { __error: string }).__error}`,
        } satisfies ProcessorResult;
      }

      const rootKey = isPlainObject(parsed)
        ? (Object.keys(parsed)[0] as string | undefined)
        : undefined;

      if (rootKey && isFeedStructure(parsed)) {
        const feed = (parsed as Record<string, unknown>)[rootKey] as Record<string, unknown>;
        const markdown = summarizeFeed(feed, options);
        return {
          content: markdown,
          metadata: {
            root: rootKey,
            type: 'feed',
          },
        } satisfies ProcessorResult;
      }

      if (isPlainObject(parsed)) {
        const markdown = convertGenericXml(parsed, options);
        return {
          content: markdown,
          metadata: {
            root: rootKey ?? 'unknown',
            type: 'generic-xml',
          },
        } satisfies ProcessorResult;
      }

      return {
        content: context.content,
        metadata: {
          type: 'unstructured-xml',
        },
      } satisfies ProcessorResult;
    },
  };
}
