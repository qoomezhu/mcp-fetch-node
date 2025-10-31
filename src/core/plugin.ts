function normalizeMimeType(value: string | null): string | null {
  if (!value) return null;
  return value.split(';')[0]?.trim().toLowerCase() ?? null;
}

export interface ProcessorContext {
  url: string;
  content: string;
  contentType: string | null;
  userAgent: string;
  raw: boolean;
}

export interface ProcessorResult {
  content: string;
  prefix: string;
}

export interface ContentProcessor {
  readonly name: string;
  readonly supportedMimeTypes?: string[];
  canProcess?(context: ProcessorContext): boolean;
  process(context: ProcessorContext): Promise<ProcessorResult> | ProcessorResult;
}

export class PluginRegistry {
  private processors: ContentProcessor[] = [];

  register(processor: ContentProcessor): void {
    this.processors.push(processor);
  }

  unregister(name: string): void {
    this.processors = this.processors.filter((p) => p.name !== name);
  }

  clear(): void {
    this.processors = [];
  }

  getAll(): ContentProcessor[] {
    return [...this.processors];
  }

  findProcessor(context: ProcessorContext): ContentProcessor | null {
    const normalizedMime = normalizeMimeType(context.contentType);

    for (const processor of this.processors) {
      if (processor.canProcess) {
        if (processor.canProcess(context)) {
          return processor;
        }
        continue;
      }

      const mimeTypes = processor.supportedMimeTypes?.map((mime) =>
        normalizeMimeType(mime),
      );

      const matchesMime = mimeTypes?.some((mime) => mime === normalizedMime);

      if (matchesMime) {
        return processor;
      }
    }

    return null;
  }
}

export const registry = new PluginRegistry();
