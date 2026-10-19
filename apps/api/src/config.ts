import { fileURLToPath } from 'node:url';
import { AGENT_NAME_DEFAULT } from '@tutor/core';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  GOOGLE_API_KEY: z.string().min(1),
  AGENT_NAME: z.string().default(AGENT_NAME_DEFAULT),
  GEMINI_TEXT_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_HINT_MODEL: z.string().default('gemini-3.5-flash-lite'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters'),
  COOKIE_SECURE: booleanString.default(false),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  SEED_DEMO: booleanString.default(true),
  MIGRATIONS_DIR: z
    .string()
    .default(fileURLToPath(new URL('../../../db/migrations', import.meta.url))),
  FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
});

export type ApiConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`API configuration is invalid or missing (${problems}). Check your .env file.`);
  }
  return parsed.data;
}
