import { z } from 'zod';
import { parseArgs } from '../utils/parse-args.js';

export const argsSchema = z.object({
  'user-agent': z.string().optional(),
  'ignore-robots-txt': z.boolean().optional(),
  port: z.coerce.number().optional().default(8080),
  'concurrency': z.coerce.number().optional().default(10),
  'queue-timeout': z.coerce.number().optional(),
  'rate-limit': z.coerce.number().optional(),
  'rate-interval': z.coerce.number().optional(),
  'pool-connections': z.coerce.number().optional().default(100),
  'pool-pipelining': z.coerce.number().optional().default(1),
  'pool-keepalive-timeout': z.coerce.number().optional().default(4000),
  'pool-keepalive-max-timeout': z.coerce.number().optional().default(600000),
  'pool-connect-timeout': z.coerce.number().optional().default(10000),
  'pool-body-timeout': z.coerce.number().optional().default(300000),
  'pool-headers-timeout': z.coerce.number().optional().default(300000),
  'plugin-html': z.coerce.boolean().optional(),
  'plugin-html-max-bytes': z.coerce.number().optional(),
  'plugin-json': z.coerce.boolean().optional(),
  'plugin-json-max-bytes': z.coerce.number().optional(),
  'plugin-json-summary-threshold': z.coerce.number().optional(),
  'plugin-json-sample-size': z.coerce.number().optional(),
  'plugin-xml': z.coerce.boolean().optional(),
  'plugin-xml-max-bytes': z.coerce.number().optional(),
  'plugin-xml-feed-items': z.coerce.number().optional(),
  'plugin-pdf': z.coerce.boolean().optional(),
  'plugin-pdf-max-bytes': z.coerce.number().optional(),
  'plugin-pdf-page-limit': z.coerce.number().optional(),
});

export type Config = z.infer<typeof argsSchema>;

export const config = argsSchema.parse(parseArgs());
