import { Paginator } from '../core/paginator.js';

const paginator = new Paginator();

export function paginate(
  url: string,
  content: string,
  prefix: string,
  startIndex: number,
  maxLength: number,
): string {
  return paginator.paginate(url, content, prefix, startIndex, maxLength);
}
