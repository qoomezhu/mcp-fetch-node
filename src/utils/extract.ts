import { Parser, ParserError as ExtractError } from '../core/parser.js';

export { ExtractError };

const parser = new Parser();

export function extract(html: string): string {
  return parser.extract(html);
}
