import { getContentProcessorConfigs } from '../config/content-processors.js';
import { createHtmlProcessor } from './plugins/html.js';
import { createJsonProcessor } from './plugins/json.js';
import { createPdfProcessor } from './plugins/pdf.js';
import { createXmlProcessor } from './plugins/xml.js';
import type { ContentProcessor, ProcessorContext, ProcessorResult } from './types.js';

let registry: ContentProcessor[] | null = null;

function buildRegistry(): ContentProcessor[] {
  const configs = getContentProcessorConfigs();
  const processors: ContentProcessor[] = [
    createHtmlProcessor(configs.html),
    createJsonProcessor(configs.json),
    createXmlProcessor(configs.xml),
    createPdfProcessor(configs.pdf),
  ];

  return processors.sort((a, b) => b.priority - a.priority);
}

export function getProcessorRegistry(): ContentProcessor[] {
  if (!registry) {
    registry = buildRegistry();
  }
  return registry;
}

export function clearProcessorRegistry() {
  registry = null;
}

export interface ProcessorExecutionResult {
  processor: ContentProcessor | null;
  result: ProcessorResult | null;
  errors: Error[];
}

export async function executeProcessors(
  context: ProcessorContext,
): Promise<ProcessorExecutionResult> {
  const processors = getProcessorRegistry();
  const errors: Error[] = [];

  for (const processor of processors) {
    if (!processor.supports(context)) {
      continue;
    }

    try {
      const result = await processor.process(context);
      if (result) {
        return {
          processor,
          result,
          errors,
        };
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return {
    processor: null,
    result: null,
    errors,
  };
}
