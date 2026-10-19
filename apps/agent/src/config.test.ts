import { describe, expect, it } from 'vitest';
import { loadConfig, speechOptionsFor } from './config.js';

const REQUIRED = {
  LIVEKIT_URL: 'wss://example.livekit.cloud',
  LIVEKIT_API_KEY: 'key',
  LIVEKIT_API_SECRET: 'secret',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadConfig', () => {
  it('defaults to the Flux, Gemini Flash and Sonic-3 pipeline', () => {
    const config = loadConfig(REQUIRED);
    expect([config.STT_MODEL, config.LLM_MODEL, config.TTS_MODEL]).toEqual([
      'deepgram/flux-general-multi',
      'google/gemini-2.5-flash',
      'cartesia/sonic-3',
    ]);
  });

  it('does not require a Google API key', () => {
    expect(() => loadConfig(REQUIRED)).not.toThrow();
  });

  it('names the missing variables when LiveKit credentials are absent', () => {
    expect(() => loadConfig({ REDIS_URL: 'redis://x' })).toThrow(/LIVEKIT_URL/);
  });
});

describe('speechOptionsFor', () => {
  it('runs Flux multilingual with a language hint', () => {
    expect(speechOptionsFor('deepgram/flux-general-multi', 'ja')).toEqual({
      language: 'multi',
      modelOptions: { language_hint: 'ja' },
    });
  });

  it('passes the language straight through for other models', () => {
    expect(speechOptionsFor('deepgram/nova-3', 'es')).toEqual({ language: 'es', modelOptions: {} });
  });
});
