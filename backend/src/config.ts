import { z } from 'zod';

// Every setting the server reads from the environment, validated once at startup.
// A missing or malformed value stops the server with a clear message instead of failing later.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Comma-separated list of origins allowed by CORS. Empty means "allow none" for browsers;
  // the mobile app does not send an Origin header, so it is unaffected.
  CORS_ORIGINS: z.string().default(''),
});

export type Config = z.infer<typeof EnvSchema> & { corsOrigins: string[] };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const corsOrigins = parsed.data.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return { ...parsed.data, corsOrigins };
}
