export interface ProcessorContext {
  url: string;
  content: string;
  contentType: string | null;
  charset: string | null;
  byteLength: number;
  raw: Uint8Array;
}

export interface ProcessorMetadata {
  [key: string]: unknown;
}

export interface ProcessorResult {
  content: string;
  prefix?: string;
  metadata?: ProcessorMetadata;
}

export interface ContentProcessor {
  /**
   * Identifier for configuring the processor.
   */
  id: string;
  /**
   * Human friendly label.
   */
  label: string;
  /**
   * Higher priority processors run first.
   */
  priority: number;
  /**
   * Returns true when the processor is able to handle the given payload.
   */
  supports(context: ProcessorContext): boolean;
  /**
   * Process the response content and return the simplified representation.
   * Returning null signals that the processor could not complete successfully and allows
   * the registry to fall back to the next candidate.
   */
  process(context: ProcessorContext): Promise<ProcessorResult | null>;
}
