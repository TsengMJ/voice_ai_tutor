import { AGENT_NAME_DEFAULT } from '@tutor/core';
import { z } from 'zod';

const EnvSchema = z.object({
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AGENT_NAME: z.string().default(AGENT_NAME_DEFAULT),
  // LiveKit Inference model strings, billed to the LiveKit project above.
  STT_MODEL: z.string().default('deepgram/flux-general-multi'),
  LLM_MODEL: z.string().default('google/gemini-2.5-flash'),
  TTS_MODEL: z.string().default('cartesia/sonic-3'),
  // Sonic-3 voices are multilingual, so one voice serves every practice language.
  TTS_VOICE: z.string().default('9626c31c-bec5-4cca-baa8-f8ba9e84c8bc'),
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

export interface SpeechOptions {
  model: string;
  language: string;
  modelOptions: Record<string, string>;
}

/**
 * English practice uses the English Flux model. The multilingual one guesses the
 * language and mishears short phrases. Other languages stay on multilingual Flux
 * with the practice language as a hint.
 */
export function speechOptionsFor(sttModel: string, languageCode: string): SpeechOptions {
  if (sttModel === 'deepgram/flux-general-multi' && languageCode === 'en') {
    return { model: 'deepgram/flux-general-en', language: 'en', modelOptions: {} };
  }
  if (sttModel === 'deepgram/flux-general-multi') {
    return { model: sttModel, language: 'multi', modelOptions: { language_hint: languageCode } };
  }
  return { model: sttModel, language: languageCode, modelOptions: {} };
}

/**
 * Ask Cartesia for a timestamp on every word. The agent's transcript synchronizer
 * then reveals each word when that word is actually spoken, instead of guessing
 * from a fixed English syllable rate that lags Sonic-3 and dumps the remainder
 * when the audio ends.
 */
export function ttsOptionsFor(ttsModel: string): { add_timestamps: true } | Record<string, never> {
  if (ttsModel.startsWith('cartesia/')) return { add_timestamps: true };
  return {};
}
