import { z } from 'zod';
import { parseArgs } from '../utils/parse-args.js';

export const argsSchema = z.object({
  'user-agent': z.string().optional(),
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
});

export type Config = z.infer<typeof argsSchema>;

const parsedArgs = parseArgs();
const envPort = process.env.PORT;

export const config = argsSchema.parse({
  ...parsedArgs,
  port: envPort ? parseInt(envPort, 10) : parsedArgs.port,
});
