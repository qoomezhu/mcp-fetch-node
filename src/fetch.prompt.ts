import { z, ZodTypeAny } from 'zod';
import { getConfig } from './config/service.js';
import { DEFAULT_USER_AGENT_MANUAL } from './constants.js';
import { getUrlPipeline } from './pipelines/index.js';

const name = 'fetch';

const description = 'Fetch a URL and extract its contents as markdown';

const parameters = {
  url: z.string().describe('URL to fetch.'),
};

type Args = z.objectOutputType<typeof parameters, ZodTypeAny>;

const execute = async ({ url }: Args) => {
  const config = getConfig();
  const userAgent = config['user-agent'] ?? DEFAULT_USER_AGENT_MANUAL;

  const pipeline = getUrlPipeline();
  const { content, prefix } = await pipeline.process(url, userAgent, false, true);

  const result = [prefix, content].join('\n').trim();

  return {
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: result },
      } as const,
    ],
  };
};

export const fetchPrompt = {
  name,
  description,
  parameters,
  execute,
};
