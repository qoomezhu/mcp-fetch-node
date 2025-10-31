import { z } from 'zod';

export const configSchema = z.object({
  port: z.number().int().positive().default(8080),
  'user-agent': z.string().optional(),
  'ignore-robots-txt': z.boolean().default(false),
  'cache-max-size': z.number().int().positive().default(50),
});

export type AppConfig = z.infer<typeof configSchema>;
