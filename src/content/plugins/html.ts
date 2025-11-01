/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import sanitizeHtml from 'sanitize-html';
import { HtmlProcessorOptions } from '../../config/content-processors.js';
import { ExtractError } from '../errors.js';
import type { ContentProcessor, ProcessorContext, ProcessorResult } from '../types.js';
import { format } from '../../utils/format.js';

const BASE_ALLOWED_TAGS = [
  'html',
  'body',
  ...sanitizeHtml.defaults.allowedTags,
];

const STRUCTURAL_SELECTORS = [
  'nav',
  'menu',
  'aside',
  'footer',
  'header',
  'form',
  'button',
  'input',
  'textarea',
  'select',
  'template',
  'iframe',
  'noscript',
  'script',
  'style',
];

const NOISE_SELECTORS = [
  '[hidden]',
  '[aria-hidden="true"]',
  '[type="button"]',
  '.hide',
  '.hide-sm',
  '.sr-only',
  '.d-none',
  '.d-sm-none',
  '.toc',
  '.sidebar',
  '#sidebar',
  '.advert',
  '.ad',
  '.ads',
  '.sponsored',
  '[role="complementary"]',
  '[role="navigation"]',
];

function withinLimit(context: ProcessorContext, options: HtmlProcessorOptions) {
  return context.byteLength <= options.maxBytes;
}

function looksLikeHtml(context: ProcessorContext) {
  const contentType = context.contentType?.toLowerCase() ?? '';
  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
    return true;
  }
  const trimmed = context.content.trimStart();
  return trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html');
}

function assignDocumentUrl(document: any, url: string) {
  try {
    Object.defineProperty(document, 'documentURI', {
      value: url,
      configurable: true,
    });
  } catch {
    // ignore inability to assign synthetic document URI
  }
  try {
    Object.defineProperty(document, 'URL', {
      value: url,
      configurable: true,
    });
  } catch {
    // ignore inability to assign synthetic URL
  }
  try {
    Object.defineProperty(document, 'location', {
      value: { href: url },
      configurable: true,
    });
  } catch {
    // ignore inability to assign synthetic location
  }
}

function sanitizeInput(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [...BASE_ALLOWED_TAGS, ...STRUCTURAL_SELECTORS],
    allowedAttributes: {
      '*': ['hidden', 'class', 'type', 'aria-hidden', 'href', 'style'],
    },
    disallowedTagsMode: 'completelyDiscard',
  });
}

function removeNoise(document: any) {
  const selectors = [...STRUCTURAL_SELECTORS, ...NOISE_SELECTORS];
  document
    .querySelectorAll(selectors.join(', '))
    ?.forEach((node: any) => {
      node.remove();
    });

  document.querySelectorAll('ul, ol, table').forEach((node: any) => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('a').forEach((anchor: any) => {
      anchor.innerHTML = '';
    });
    const htmlLength = clone.innerHTML.length;
    const textLength = clone.innerText.length;
    if (htmlLength > 0 && textLength / htmlLength < 0.2) {
      node.remove();
    }
  });

  document.querySelectorAll('a').forEach((anchor: any) => {
    if (anchor.textContent.trim() === '') {
      anchor.remove();
    }
  });
}

function readabilityExtract(document: any) {
  try {
    const reader = new Readability(document, {
      keepClasses: false,
    });
    const result = reader.parse();
    if (result?.content && result.content.trim().length > 0) {
      return {
        html: result.content as string,
        metadata: {
          title: result.title,
          byline: result.byline,
          length: result.length,
          excerpt: result.excerpt,
        },
      };
    }
  } catch {
    // ignore readability failures and fall back to heuristics
  }
  return null;
}

function computeHeuristicScore(node: any) {
  const textContent = node.innerText?.trim() ?? '';
  if (textContent.length < 120) {
    return 0;
  }

  const headingCount = node.querySelectorAll?.('h1, h2, h3, h4, h5, h6').length ?? 0;
  let linkTextLength = 0;
  node.querySelectorAll?.('a').forEach((anchor: any) => {
    linkTextLength += anchor.textContent?.length ?? 0;
  });

  const linkDensity = textContent.length === 0 ? 0 : linkTextLength / textContent.length;
  const densityPenalty = linkDensity > 0.2 ? linkDensity * 200 : 0;
  return textContent.length + headingCount * 80 - densityPenalty;
}

function heuristicExtract(document: any) {
  const candidates = Array.from(
    document.querySelectorAll?.('article, main, section, div') ?? [],
  ) as any[];

  let bestNode: any | null = null;
  let bestScore = 0;

  for (const node of candidates) {
    const score = computeHeuristicScore(node);
    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }

  if (bestNode) {
    return {
      html: bestNode.innerHTML as string,
      metadata: undefined,
    };
  }

  const bodyHtml = document.body?.innerHTML ?? '';
  return bodyHtml ? { html: bodyHtml, metadata: undefined } : null;
}

function sanitizeOutput(html: string) {
  return sanitizeHtml(html, {
    allowedAttributes: {
      a: ['href', 'title'],
      strong: ['class'],
      em: ['class'],
    },
    allowedTags: sanitizeHtml.defaults.allowedTags,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noreferrer noopener' }, true),
    },
  });
}

function extractMainContent(context: ProcessorContext) {
  try {
    const sanitized = sanitizeInput(context.content);
    const { document } = parseHTML(sanitized);
    assignDocumentUrl(document, context.url);
    removeNoise(document);

    const readabilityResult = readabilityExtract(document);
    const heuristicsResult = !readabilityResult ||
      (readabilityResult.html.replace(/<[^>]+>/g, '').trim().length < 160 &&
        document.querySelector('article, main, section'))
      ? heuristicExtract(document)
      : null;

    const chosen = readabilityResult ?? heuristicsResult ?? heuristicExtract(document);

    if (!chosen) {
      throw new ExtractError('Primary content could not be determined');
    }

    const cleaned = sanitizeOutput(chosen.html);

    return {
      html: cleaned,
      metadata: chosen.metadata ?? readabilityResult?.metadata ?? undefined,
    };
  } catch (error) {
    if (error instanceof ExtractError) {
      throw error;
    }
    throw new ExtractError('Failed to extract primary HTML content', error);
  }
}

export function createHtmlProcessor(
  options: HtmlProcessorOptions,
): ContentProcessor {
  return {
    id: 'html',
    label: 'HTML',
    priority: 100,
    supports(context) {
      if (!options.enabled) {
        return false;
      }
      if (!looksLikeHtml(context)) {
        return false;
      }
      if (!withinLimit(context, options)) {
        return false;
      }
      return true;
    },
    async process(context) {
      if (!withinLimit(context, options)) {
        return null;
      }

      const { html, metadata } = extractMainContent(context);
      const markdown = format(html);

      if (!markdown.trim()) {
        return {
          content: '<error>Page failed to be simplified from HTML</error>',
          metadata,
        };
      }

      return {
        content: markdown,
        metadata,
      } as ProcessorResult;
    },
  };
}
