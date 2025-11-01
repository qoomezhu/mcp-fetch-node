import { config } from './config.js';

const MB = 1024 * 1024;

export interface BaseProcessorOptions {
  enabled: boolean;
  maxBytes: number;
}

export interface HtmlProcessorOptions extends BaseProcessorOptions {}

export interface JsonProcessorOptions extends BaseProcessorOptions {
  summaryThreshold: number;
  sampleSize: number;
}

export interface XmlProcessorOptions extends BaseProcessorOptions {
  feedItems: number;
}

export interface PdfProcessorOptions extends BaseProcessorOptions {
  pageLimit: number;
}

export interface ContentProcessorConfigs {
  html: HtmlProcessorOptions;
  json: JsonProcessorOptions;
  xml: XmlProcessorOptions;
  pdf: PdfProcessorOptions;
}

export type ContentProcessorConfigOverrides = {
  [K in keyof ContentProcessorConfigs]?: Partial<ContentProcessorConfigs[K]>;
};

const defaults: ContentProcessorConfigs = {
  html: {
    enabled: true,
    maxBytes: 2 * MB,
  },
  json: {
    enabled: true,
    maxBytes: 512 * 1024,
    summaryThreshold: 128 * 1024,
    sampleSize: 12,
  },
  xml: {
    enabled: true,
    maxBytes: 512 * 1024,
    feedItems: 10,
  },
  pdf: {
    enabled: true,
    maxBytes: 8 * MB,
    pageLimit: 20,
  },
};

function resolveBoolean(value: boolean | undefined, fallback: boolean) {
  return value ?? fallback;
}

function resolveNumber(value: number | undefined, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return value > 0 ? value : fallback;
}

function createConfig(): ContentProcessorConfigs {
  return {
    html: {
      enabled: resolveBoolean(config['plugin-html'], defaults.html.enabled),
      maxBytes: resolveNumber(
        config['plugin-html-max-bytes'],
        defaults.html.maxBytes,
      ),
    },
    json: {
      enabled: resolveBoolean(config['plugin-json'], defaults.json.enabled),
      maxBytes: resolveNumber(
        config['plugin-json-max-bytes'],
        defaults.json.maxBytes,
      ),
      summaryThreshold: resolveNumber(
        config['plugin-json-summary-threshold'],
        defaults.json.summaryThreshold,
      ),
      sampleSize: resolveNumber(
        config['plugin-json-sample-size'],
        defaults.json.sampleSize,
      ),
    },
    xml: {
      enabled: resolveBoolean(config['plugin-xml'], defaults.xml.enabled),
      maxBytes: resolveNumber(
        config['plugin-xml-max-bytes'],
        defaults.xml.maxBytes,
      ),
      feedItems: resolveNumber(
        config['plugin-xml-feed-items'],
        defaults.xml.feedItems,
      ),
    },
    pdf: {
      enabled: resolveBoolean(config['plugin-pdf'], defaults.pdf.enabled),
      maxBytes: resolveNumber(
        config['plugin-pdf-max-bytes'],
        defaults.pdf.maxBytes,
      ),
      pageLimit: resolveNumber(
        config['plugin-pdf-page-limit'],
        defaults.pdf.pageLimit,
      ),
    },
  };
}

let cachedConfig = createConfig();

export function getContentProcessorConfigs() {
  return cachedConfig;
}

export function overrideContentProcessorConfigs(
  overrides: ContentProcessorConfigOverrides,
) {
  cachedConfig = mergeConfigs(cachedConfig, overrides);
}

export function resetContentProcessorConfigs() {
  cachedConfig = createConfig();
}

function mergeConfigs(
  base: ContentProcessorConfigs,
  overrides: ContentProcessorConfigOverrides,
): ContentProcessorConfigs {
  return (Object.keys(base) as Array<keyof ContentProcessorConfigs>).reduce(
    (acc, key) => {
      acc[key] = {
        ...base[key],
        ...(overrides[key] ?? {}),
      } as ContentProcessorConfigs[typeof key];
      return acc;
    },
    { ...base },
  );
}
