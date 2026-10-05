import { z } from 'zod';

const DEV_DATABASE_URL = 'postgres://profit:profit@localhost:5432/profit';
// Only ever used outside production. Production refuses to start without its own secret.
const DEV_JWT_SECRET = 'profit-development-secret-not-for-production-use';

const flag = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

// Every setting the server reads from the environment, validated once at startup.
// A missing or malformed value stops the server with a clear message instead of failing later.
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    // Comma-separated list of origins allowed by CORS. Empty means "allow none" for browsers;
    // the mobile app does not send an Origin header, so it is unaffected.
    CORS_ORIGINS: z.string().default(''),
    DATABASE_URL: z.string().optional(),
    // Signs ProFit's access tokens. At least 32 characters; generate one with `openssl rand -base64 48`.
    JWT_SECRET: z.string().optional(),
    // Comma-separated OAuth client IDs whose Google ID tokens are accepted. With Android Credential
    // Manager the token's audience is the Web client ID, so that one must be listed.
    GOOGLE_CLIENT_IDS: z.string().default(''),
    // Developer sign-in without Google, for emulators and local testing. Never allowed in production.
    AUTH_DEV_LOGIN: flag,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.DATABASE_URL) ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'is required in production' });
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
      ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'must be set to at least 32 characters in production' });
    }
    if (!env.GOOGLE_CLIENT_IDS.trim()) ctx.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_IDS'], message: 'is required in production' });
    if (env.AUTH_DEV_LOGIN) ctx.addIssue({ code: 'custom', path: ['AUTH_DEV_LOGIN'], message: 'must be off in production' });
  });

type Env = z.infer<typeof EnvSchema>;

export type Config = Omit<Env, 'DATABASE_URL' | 'JWT_SECRET'> & {
  DATABASE_URL: string;
  JWT_SECRET: string;
  corsOrigins: string[];
  googleClientIds: string[];
};

const list = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  const data = parsed.data;
  return {
    ...data,
    DATABASE_URL: data.DATABASE_URL ?? DEV_DATABASE_URL,
    JWT_SECRET: data.JWT_SECRET ?? DEV_JWT_SECRET,
    corsOrigins: list(data.CORS_ORIGINS),
    googleClientIds: list(data.GOOGLE_CLIENT_IDS),
  };
}
