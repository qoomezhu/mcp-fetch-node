import { Buffer } from 'node:buffer';
import { parseHTML, parseXML } from 'linkedom';
import { z } from 'zod';

const metadataValueSchema = z.union([z.string(), z.array(z.string())]);

export const metadataSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  publishDate: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  language: z.string().min(1).optional(),
  charset: z.string().min(1).optional(),
  openGraph: z.record(metadataValueSchema).optional(),
  twitterCard: z.record(metadataValueSchema).optional(),
  microdata: z
    .array(
      z.object({
        type: z.string().optional(),
        properties: z.record(metadataValueSchema).optional(),
      }),
    )
    .optional(),
  jsonLd: z.array(z.unknown()).optional(),
  jsonFeed: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      language: z.string().optional(),
      authors: z.array(z.string()).optional(),
      homePageURL: z.string().optional(),
    })
    .optional(),
  xmlFeed: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      language: z.string().optional(),
      link: z.string().optional(),
      updated: z.string().optional(),
    })
    .optional(),
  pdf: z
    .object({
      title: z.string().optional(),
      author: z.string().optional(),
      subject: z.string().optional(),
      creator: z.string().optional(),
      producer: z.string().optional(),
      creationDate: z.string().optional(),
      modificationDate: z.string().optional(),
    })
    .optional(),
});

export type Metadata = z.infer<typeof metadataSchema>;

interface ExtractMetadataParams {
  url?: string;
  content: string;
  contentType?: string | null;
  arrayBuffer?: ArrayBuffer | ArrayBufferView | Buffer | null;
}

type StringRecord = Record<string, string | string[]>;

type MetaAccumulator = Map<string, string[]>;

type PartialMetadata = Partial<Metadata>;

type HtmlDocument = ReturnType<typeof parseHTML>['document'];
type XmlDocument = ReturnType<typeof parseXML>['document'];

const PDF_DATE_PATTERN = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|[+\-]\d{2}'?\d{2}'?)?/;

const JSON_TITLE_KEYS = ['title', 'name', 'headline'];
const JSON_DESCRIPTION_KEYS = ['description', 'summary', 'abstract', 'subtitle'];
const JSON_LANGUAGE_KEYS = ['language', 'lang', 'locale'];
const JSON_PUBLISH_DATE_KEYS = [
  'datePublished',
  'date_published',
  'date',
  'published_at',
  'created_at',
  'created',
];

function normalize(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeLocale(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/_/g, '-');
}

function addToMetaAccumulator(
  map: MetaAccumulator,
  key: string | null,
  value: string | null,
) {
  const normalizedKey = normalize(key?.toLowerCase());
  const normalizedValue = normalize(value);
  if (!normalizedKey || !normalizedValue) return;
  const existing = map.get(normalizedKey);
  if (existing) existing.push(normalizedValue);
  else map.set(normalizedKey, [normalizedValue]);
}

function firstFromMap(map: MetaAccumulator, key: string): string | undefined {
  const values = map.get(key.toLowerCase());
  return values?.find((item) => item.length > 0);
}

function metaAccumulatorToRecord(map: MetaAccumulator): StringRecord {
  const record: StringRecord = {};
  for (const [key, values] of map.entries()) {
    if (values.length === 1) record[key] = values[0];
    else if (values.length > 1) record[key] = Array.from(new Set(values));
  }
  return record;
}

function mergeRecords(
  target: StringRecord | undefined,
  source: StringRecord,
): StringRecord {
  const result: StringRecord = { ...(target ?? {}) };
  for (const [key, value] of Object.entries(source)) {
    const normalizedValues = (Array.isArray(value) ? value : [value])
      .map(normalize)
      .filter((item): item is string => Boolean(item));
    if (normalizedValues.length === 0) continue;

    const existing = result[key];
    const existingValues = Array.isArray(existing)
      ? existing
      : existing
        ? [existing]
        : [];
    const combined = Array.from(
      new Set([...existingValues, ...normalizedValues]),
    );
    if (combined.length === 1) result[key] = combined[0];
    else if (combined.length > 1) result[key] = combined;
  }
  return result;
}

function pick(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalizedValue = normalize(value);
    if (normalizedValue) return normalizedValue;
  }
  return undefined;
}

function ensureArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function normalizeKeywords(
  value: unknown,
): string[] | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    const split = value
      .split(',')
      .map((item) => normalize(item))
      .filter((item): item is string => Boolean(item));
    return split.length ? split : undefined;
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalize(String(item)))
      .filter((item): item is string => Boolean(item));
    return normalized.length ? normalized : undefined;
  }
  return undefined;
}

function decodePdfEscapes(value: string): string {
  return value
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\f/g, '\f')
    .replace(/\\b/g, '\b')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function toBuffer(
  value: ArrayBuffer | ArrayBufferView | Buffer,
): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function extractPdfString(text: string, key: string): string | undefined {
  const marker = `/${key}`;
  let index = text.indexOf(marker);
  if (index === -1) return undefined;

  while (index !== -1) {
    const afterMarker = index + marker.length;
    const openingParenIndex = text.indexOf('(', afterMarker);
    const openingAngleIndex = text.indexOf('<', afterMarker);

    if (
      openingAngleIndex !== -1 &&
      (openingParenIndex === -1 || openingAngleIndex < openingParenIndex)
    ) {
      const closingAngleIndex = text.indexOf('>', openingAngleIndex + 1);
      if (closingAngleIndex === -1) return undefined;
      const hexContent = text
        .substring(openingAngleIndex + 1, closingAngleIndex)
        .replace(/\s+/g, '');
      if (hexContent.length % 2 === 1) return undefined;
      const buffer = Buffer.from(hexContent, 'hex');
      const decoded = normalize(buffer.toString('utf8'));
      if (decoded) return decoded;
      index = text.indexOf(marker, closingAngleIndex + 1);
      continue;
    }

    if (openingParenIndex === -1) return undefined;

    let result = '';
    let escape = false;
    for (let i = openingParenIndex + 1; i < text.length; i += 1) {
      const char = text[i] ?? '';
      if (!escape && char === ')') {
        const decoded = normalize(decodePdfEscapes(result));
        if (decoded) return decoded;
        break;
      }
      if (!escape && char === '\\') {
        escape = true;
        continue;
      }
      result += char;
      escape = false;
    }

    index = text.indexOf(marker, openingParenIndex + 1);
  }
  return undefined;
}

function normalizePdfDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = PDF_DATE_PATTERN.exec(value);
  if (!match) return normalize(value);
  const [, year, month, day, hour, minute, second, tz] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  if (!tz) return `${iso}Z`;
  if (tz === 'Z') return `${iso}Z`;
  const cleaned = tz.replace(/'/g, '');
  const offsetHours = cleaned.slice(0, 3);
  const offsetMinutes = cleaned.slice(3);
  return `${iso}${offsetHours}:${offsetMinutes || '00'}`;
}

function extractPdfMetadata(
  arrayBuffer: ArrayBuffer | ArrayBufferView | Buffer,
): PartialMetadata {
  const buffer = toBuffer(arrayBuffer);
  const text = buffer.toString('latin1');

  const pdfDetails = {
    title: extractPdfString(text, 'Title'),
    author: extractPdfString(text, 'Author'),
    subject: extractPdfString(text, 'Subject'),
    creator: extractPdfString(text, 'Creator'),
    producer: extractPdfString(text, 'Producer'),
    creationDate: normalizePdfDate(extractPdfString(text, 'CreationDate')),
    modificationDate: normalizePdfDate(extractPdfString(text, 'ModDate')),
  } as Metadata['pdf'];

  const filteredEntries = Object.entries(pdfDetails ?? {})
    .map((entry) => [entry[0], normalize(entry[1])] as const)
    .filter((entry): entry is [string, string] => Boolean(entry[1]));

  if (filteredEntries.length === 0) return {};

  const pdfInfo = Object.fromEntries(filteredEntries) as Metadata['pdf'];

  const result: PartialMetadata = {
    pdf: pdfInfo,
  };

  if (pdfInfo.title) result.title = pdfInfo.title;
  if (pdfInfo.author) result.author = pdfInfo.author;
  if (pdfInfo.creationDate) result.publishDate = pdfInfo.creationDate;

  return result;
}

function collectMicrodata(document: HtmlDocument): Metadata['microdata'] {
  const scopes = Array.from(document.querySelectorAll('[itemscope]'));
  const microdata: NonNullable<Metadata['microdata']> = [];

  scopes.forEach((scope) => {
    const type = normalize(scope.getAttribute('itemtype'));
    const properties: StringRecord = {};

    const propertyNodes = Array.from(scope.querySelectorAll('[itemprop]'));

    propertyNodes.forEach((node) => {
      if (node.closest('[itemscope]') !== scope && node !== scope) return;
      const key = normalize(node.getAttribute('itemprop'));
      if (!key) return;
      const candidate =
        normalize(node.getAttribute('content')) ??
        normalize(node.getAttribute('datetime')) ??
        normalize(node.getAttribute('href')) ??
        normalize(node.getAttribute('src')) ??
        normalize(node.textContent ?? undefined);
      if (!candidate) return;
      const existing = properties[key];
      if (!existing) properties[key] = candidate;
      else if (Array.isArray(existing)) existing.push(candidate);
      else properties[key] = [existing, candidate];
    });

    if (Object.keys(properties).length > 0) {
      microdata.push({ type, properties });
    }
  });

  return microdata.length > 0 ? microdata : undefined;
}

function collectJsonLd(document: HtmlDocument): Metadata['jsonLd'] {
  const scripts = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  );
  const jsonLd: NonNullable<Metadata['jsonLd']> = [];

  scripts.forEach((script) => {
    const text = normalize(script.textContent ?? undefined);
    if (!text) return;
    try {
      const cleaned = text
        .replace(/^<!--/, '')
        .replace(/-->$/, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      if (parsed) jsonLd.push(parsed);
    } catch {
      // Ignore invalid JSON-LD blocks
    }
  });

  return jsonLd.length > 0 ? jsonLd : undefined;
}

function extractHtmlMetadata(content: string): PartialMetadata {
  try {
    const { document } = parseHTML(content);
    const metaByName: MetaAccumulator = new Map();
    const metaByProperty: MetaAccumulator = new Map();
    const metaByHttpEquiv: MetaAccumulator = new Map();
    const openGraphMap: MetaAccumulator = new Map();
    const twitterMap: MetaAccumulator = new Map();

    Array.from(document.querySelectorAll('meta')).forEach((meta) => {
      const name = meta.getAttribute('name');
      const property = meta.getAttribute('property');
      const httpEquiv = meta.getAttribute('http-equiv');
      const contentValue = meta.getAttribute('content');

      addToMetaAccumulator(metaByName, name, contentValue);
      addToMetaAccumulator(metaByProperty, property, contentValue);
      addToMetaAccumulator(metaByHttpEquiv, httpEquiv, contentValue);

      const normalizedProperty = normalize(property);
      if (
        normalizedProperty?.startsWith('og:') ||
        normalizedProperty?.startsWith('article:')
      ) {
        addToMetaAccumulator(openGraphMap, normalizedProperty, contentValue);
      }

      const normalizedName = normalize(name);
      if (normalizedName?.startsWith('twitter:')) {
        addToMetaAccumulator(twitterMap, normalizedName, contentValue);
      }
    });

    const jsonLd = collectJsonLd(document);
    const microdata = collectMicrodata(document);

    const htmlTitle = pick(
      firstFromMap(metaByName, 'title') ?? undefined,
      firstFromMap(metaByProperty, 'og:title') ?? undefined,
      firstFromMap(twitterMap, 'twitter:title') ?? undefined,
      document.querySelector('title')?.textContent ?? undefined,
      document.querySelector('h1')?.textContent ?? undefined,
    );

    const htmlDescription = pick(
      firstFromMap(metaByName, 'description') ?? undefined,
      firstFromMap(metaByProperty, 'og:description') ?? undefined,
      firstFromMap(twitterMap, 'twitter:description') ?? undefined,
      document.querySelector('meta[name="summary"]')?.getAttribute('content') ??
        undefined,
      document.querySelector('p')?.textContent ?? undefined,
    );

    const htmlAuthor = pick(
      firstFromMap(metaByName, 'author') ?? undefined,
      firstFromMap(metaByProperty, 'article:author') ?? undefined,
      firstFromMap(metaByProperty, 'book:author') ?? undefined,
      firstFromMap(metaByName, 'dc.creator') ?? undefined,
      firstFromMap(twitterMap, 'twitter:creator') ?? undefined,
    );

    const htmlPublishDate = pick(
      firstFromMap(metaByProperty, 'article:published_time') ?? undefined,
      firstFromMap(metaByName, 'pubdate') ?? undefined,
      firstFromMap(metaByName, 'publishdate') ?? undefined,
      firstFromMap(metaByName, 'date') ?? undefined,
      firstFromMap(metaByName, 'datePublished') ?? undefined,
      firstFromMap(metaByName, 'dc.date') ?? undefined,
    );

    const htmlKeywords = normalizeKeywords(firstFromMap(metaByName, 'keywords'));

    const htmlLang = normalizeLocale(
      normalize(document.documentElement?.getAttribute('lang')) ??
        firstFromMap(metaByHttpEquiv, 'content-language') ??
        firstFromMap(metaByProperty, 'og:locale') ??
        undefined,
    );

    const computedCharset = normalize(
      document.characterSet ??
        document.querySelector('meta[charset]')?.getAttribute('charset') ??
        undefined,
    );
    const httpEquivCharset = normalize(
      firstFromMap(metaByHttpEquiv, 'content-type') ?? undefined,
    );

    let charset: string | undefined = computedCharset;
    if (!charset && httpEquivCharset) {
      const match = /charset=([^;]+)/i.exec(httpEquivCharset);
      charset = normalize(match?.[1] ?? httpEquivCharset);
    }

    const openGraph = metaAccumulatorToRecord(openGraphMap);
    const twitterCard = metaAccumulatorToRecord(twitterMap);

    const result: PartialMetadata = {
      title: htmlTitle,
      description: htmlDescription,
      author: htmlAuthor,
      publishDate: htmlPublishDate,
      keywords: htmlKeywords,
      language: htmlLang,
      charset,
      openGraph: Object.keys(openGraph).length ? openGraph : undefined,
      twitterCard: Object.keys(twitterCard).length ? twitterCard : undefined,
      jsonLd,
      microdata,
    };

    return result;
  } catch {
    return {};
  }
}

function extractJsonMetadata(content: string): PartialMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {};
  }

  let candidate = parsed;
  if (Array.isArray(parsed)) {
    candidate = parsed.find((item) => item && typeof item === 'object') ?? null;
  }

  const objectCandidate =
    candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>) : undefined;

  if (!objectCandidate) return {};

  const keywordsFromValue = normalizeKeywords(objectCandidate.keywords);

  const authors: string[] = [];
  const authorValue = objectCandidate.author ?? objectCandidate.authors;

  if (authorValue) {
    if (Array.isArray(authorValue)) {
      authorValue.forEach((value) => {
        if (!value) return;
        if (typeof value === 'string') {
          const normalizedValue = normalize(value);
          if (normalizedValue) authors.push(normalizedValue);
          return;
        }
        if (typeof value === 'object') {
          const namedAuthor = normalize((value as Record<string, unknown>).name as string | undefined);
          if (namedAuthor) authors.push(namedAuthor);
        }
      });
    } else if (typeof authorValue === 'object') {
      const namedAuthor = normalize(
        (authorValue as Record<string, unknown>).name as string | undefined,
      );
      if (namedAuthor) authors.push(namedAuthor);
    } else {
      const normalizedValue = normalize(String(authorValue));
      if (normalizedValue) authors.push(normalizedValue);
    }
  }

  const publishDate = pick(
    ...JSON_PUBLISH_DATE_KEYS.map((key) =>
      normalize(objectCandidate[key] as string | undefined),
    ),
  );

  const language = normalizeLocale(
    pick(
      ...JSON_LANGUAGE_KEYS.map((key) =>
        normalize(objectCandidate[key] as string | undefined),
      ),
    ),
  );

  const description = pick(
    ...JSON_DESCRIPTION_KEYS.map((key) =>
      normalize(objectCandidate[key] as string | undefined),
    ),
  );

  const title = pick(
    ...JSON_TITLE_KEYS.map((key) =>
      normalize(objectCandidate[key] as string | undefined),
    ),
  );

  const jsonFeed: NonNullable<Metadata['jsonFeed']> = {};

  if ('home_page_url' in objectCandidate) {
    jsonFeed.homePageURL = normalize(
      objectCandidate.home_page_url as string | undefined,
    );
  }

  if ('language' in objectCandidate && !language) {
    jsonFeed.language = normalizeLocale(
      normalize(objectCandidate.language as string | undefined),
    );
  }

  if ('title' in objectCandidate && !title) {
    jsonFeed.title = normalize(objectCandidate.title as string | undefined);
  }

  if ('description' in objectCandidate && !description) {
    jsonFeed.description = normalize(
      objectCandidate.description as string | undefined,
    );
  }

  if (authors.length > 0) jsonFeed.authors = Array.from(new Set(authors));

  const result: PartialMetadata = {
    title,
    description,
    author: authors[0],
    publishDate,
    keywords: keywordsFromValue,
    language,
  };

  if (Object.keys(jsonFeed).length > 0) {
    result.jsonFeed = jsonFeed;
  }

  return result;
}

function extractXmlMetadata(content: string): PartialMetadata {
  try {
    const { document } = parseXML(content) as { document: XmlDocument };

    const getText = (selector: string): string | undefined =>
      normalize(document.querySelector(selector)?.textContent ?? undefined);

    const title = pick(
      getText('channel > title'),
      getText('feed > title'),
      getText('rss > channel > title'),
    );
    const description = pick(
      getText('channel > description'),
      getText('feed > subtitle'),
      getText('feed > summary'),
    );
    const language = normalizeLocale(
      pick(
        getText('channel > language'),
        document.documentElement?.getAttribute('xml:lang') ?? undefined,
        document.documentElement?.getAttribute('lang') ?? undefined,
      ),
    );

    const updated = pick(
      getText('channel > lastBuildDate'),
      getText('channel > pubDate'),
      getText('feed > updated'),
    );
    const link = pick(
      document.querySelector('channel > link')?.textContent ?? undefined,
      document.querySelector('feed > link[href]')?.getAttribute('href') ?? undefined,
    );

    const result: PartialMetadata = {
      title,
      description,
      language,
      publishDate: updated,
    };

    const xmlFeed: NonNullable<Metadata['xmlFeed']> = {};

    if (title) xmlFeed.title = title;
    if (description) xmlFeed.description = description;
    if (language) xmlFeed.language = language;
    if (link) xmlFeed.link = link;
    if (updated) xmlFeed.updated = updated;

    if (Object.keys(xmlFeed).length > 0) {
      result.xmlFeed = xmlFeed;
    }

    return result;
  } catch {
    return {};
  }
}

function mergeMetadata(
  target: PartialMetadata,
  source: PartialMetadata | undefined,
) {
  if (!source) return;

  const simpleFields: Array<keyof Metadata> = [
    'title',
    'description',
    'author',
    'publishDate',
    'language',
    'charset',
  ];

  simpleFields.forEach((field) => {
    const value = source[field];
    if (typeof value === 'string' && value && !target[field]) {
      target[field] = value;
    }
  });

  if (source.keywords?.length) {
    const existing = target.keywords ?? [];
    target.keywords = [...existing, ...source.keywords];
  }

  if (source.openGraph) {
    target.openGraph = mergeRecords(target.openGraph, source.openGraph);
  }
  if (source.twitterCard) {
    target.twitterCard = mergeRecords(target.twitterCard, source.twitterCard);
  }
  if (source.microdata?.length) {
    target.microdata = [...(target.microdata ?? []), ...source.microdata];
  }
  if (source.jsonLd?.length) {
    target.jsonLd = [...(target.jsonLd ?? []), ...source.jsonLd];
  }
  if (source.jsonFeed) {
    const existingFeed = (target.jsonFeed ?? {}) as Metadata['jsonFeed'];
    const authors = Array.from(
      new Set([
        ...(existingFeed.authors ?? []),
        ...(source.jsonFeed.authors ?? []),
      ]),
    ).filter((item): item is string => Boolean(item && item.length > 0));
    target.jsonFeed = {
      ...existingFeed,
      ...source.jsonFeed,
      ...(authors.length ? { authors } : {}),
    };
  }
  if (source.xmlFeed) {
    target.xmlFeed = {
      ...(target.xmlFeed ?? {}),
      ...source.xmlFeed,
    };
  }
  if (source.pdf) {
    target.pdf = {
      ...(target.pdf ?? {}),
      ...source.pdf,
    };
  }
}

export function extractMetadata(params: ExtractMetadataParams): Metadata {
  const { content, contentType, arrayBuffer } = params;
  const lowerContentType = contentType?.toLowerCase() ?? '';

  const metadata: PartialMetadata = {};

  const trimmedContent = content.trim();

  const isLikelyHTML =
    lowerContentType.includes('text/html') || trimmedContent.startsWith('<!DOCTYPE html') || trimmedContent.startsWith('<html');
  const isLikelyJSON =
    lowerContentType.includes('json') ||
    ((!lowerContentType || lowerContentType.includes('text/plain')) &&
      ((trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) ||
        (trimmedContent.startsWith('[') && trimmedContent.endsWith(']'))));
  const isLikelyXML =
    lowerContentType.includes('xml') ||
    lowerContentType.includes('rss') ||
    lowerContentType.includes('atom') ||
    trimmedContent.startsWith('<?xml');
  const isLikelyPDF = lowerContentType.includes('pdf');

  if (isLikelyHTML) {
    mergeMetadata(metadata, extractHtmlMetadata(content));
  }

  if (isLikelyJSON) {
    mergeMetadata(metadata, extractJsonMetadata(content));
  }

  if (isLikelyXML) {
    mergeMetadata(metadata, extractXmlMetadata(content));
  }

  if (isLikelyPDF && arrayBuffer) {
    mergeMetadata(metadata, extractPdfMetadata(arrayBuffer));
  }

  if (metadata.keywords?.length) {
    const uniqueKeywords = Array.from(
      new Set(
        metadata.keywords
          .map((keyword) => normalize(keyword))
          .filter((keyword): keyword is string => Boolean(keyword)),
      ),
    );
    metadata.keywords = uniqueKeywords.length ? uniqueKeywords : undefined;
  }

  if (metadata.microdata?.length === 0) {
    delete metadata.microdata;
  }

  if (metadata.jsonLd?.length === 0) {
    delete metadata.jsonLd;
  }

  if (metadata.openGraph && Object.keys(metadata.openGraph).length === 0) {
    delete metadata.openGraph;
  }
  if (metadata.twitterCard && Object.keys(metadata.twitterCard).length === 0) {
    delete metadata.twitterCard;
  }

  return metadataSchema.parse(metadata);
}
