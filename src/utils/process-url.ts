import { getUrlPipeline } from '../pipelines/index.js';

export async function processURL(
  url: string,
  userAgent: string,
  raw: boolean,
): Promise<[string, string]> {
  const pipeline = getUrlPipeline();
  const result = await pipeline.process(url, userAgent, raw, true);
  return [result.content, result.prefix];
}
