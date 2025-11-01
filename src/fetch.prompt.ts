import { z, ZodTypeAny } from 'zod';
import { config } from './config/config.js';
import { DEFAULT_USER_AGENT_MANUAL } from './constants.js';
import { cache } from './utils/lru-cache.js';
import { processURL } from './utils/process-url.js';

const name = 'fetch';

const description = 'Fetch a URL and extract its contents as markdown';

const parameters = {
  url: z.string().describe('URL to fetch.'),
};

type Args = z.objectOutputType<typeof parameters, ZodTypeAny>;

// PromptCallback<typeof parameters>
const execute = async ({ url }: Args) => {
  const userAgent = config['user-agent'] ?? DEFAULT_USER_AGENT_MANUAL;

  const cacheKey = `${url}||${userAgent}||false`;

  const cached = cache.get(cacheKey);

  let processed = cached;

  if (!processed) {
    processed = await processURL(url, userAgent, false);

    cache.set(cacheKey, processed);
  }

  if (!processed) {
    throw new Error('Failed to process URL');
  }

  const result = [processed.prefix, processed.content].join('\n').trim();

  return {
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: result },
      } as const,
    ],
    metadata: processed.metadata,
  };
};

export const fetchPrompt = {
  name,
  description,
  parameters,
  execute,
};
