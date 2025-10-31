import { Converter, ConverterError as FormatError } from '../core/converter.js';

export { FormatError };

const converter = new Converter();

export function format(html: string): string {
  return converter.toMarkdown(html);
}
