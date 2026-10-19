import { AGENT_NAME_DEFAULT } from '@tutor/core';
import { z } from 'zod';

const EnvSchema = z.object({
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  GOOGLE_API_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AGENT_NAME: z.string().default(AGENT_NAME_DEFAULT),
  GEMINI_LIVE_MODEL: z.string().default('gemini-2.5-flash-native-audio-preview-12-2025'),
  GEMINI_VOICE: z.string().default('Puck'),
});

export type AgentConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Agent configuration is invalid or missing: ${missing}. Check your .env file.`);
  }
  return parsed.data;
}
