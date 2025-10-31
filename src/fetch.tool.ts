import { z, ZodTypeAny } from 'zod';
import { getConfig } from './config/service.js';
import { DEFAULT_USER_AGENT_AUTONOMOUS } from './constants.js';
import { getUrlPipeline } from './pipelines/index.js';
import { Paginator } from './core/paginator.js';

const name = 'fetch';

const description = `Fetches a URL from the internet and optionally extracts its contents as markdown.`;

const parameters = {
  url: z.string().describe('URL to fetch.'),

  max_length: z
    .number()
    .min(0)
    .max(1_000_000)
    .default(5_000)
    .describe('Maximum number of characters to return. Default: 5000.'),

  start_index: z
    .number()
    .min(0)
    .default(0)
    .describe(
      'Return output starting at this character index, useful if a previous fetch was truncated and more context is required. Default: 0.',
    ),

  raw: z
    .boolean()
    .default(false)
    .describe(
      'Get the actual HTML content of the requested page, without simplification. Default: false.',
    ),
};

type Args = z.objectOutputType<typeof parameters, ZodTypeAny>;

const execute = async ({ url, max_length, start_index, raw }: Args) => {
  const config = getConfig();
  const userAgent = config['user-agent'] ?? DEFAULT_USER_AGENT_AUTONOMOUS;

  const pipeline = getUrlPipeline();
  const { content, prefix } = await pipeline.process(
    url,
    userAgent,
    raw,
    config['ignore-robots-txt'],
  );

  const paginator = new Paginator();
  const result = paginator.paginate(url, content, prefix, start_index, max_length);

  return {
    content: [{ type: 'text' as const, text: result }],
  };
};

export const fetchTool = {
  name,
  description,
  parameters,
  execute,
};
