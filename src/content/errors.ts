export class ContentProcessorError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ContentProcessorError';
  }
}

export class ExtractError extends ContentProcessorError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ExtractError';
  }
}

export class FormatError extends ContentProcessorError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'FormatError';
  }
}
