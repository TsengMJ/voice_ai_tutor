import { describe, expect, it } from 'vitest';
import { loadConfig, speechOptionsFor, ttsOptionsFor } from './config.js';

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
  it('uses the English Flux model for English practice', () => {
    expect(speechOptionsFor('deepgram/flux-general-multi', 'en')).toEqual({
      model: 'deepgram/flux-general-en',
      language: 'en',
      modelOptions: {},
    });
  });

  it('runs Flux multilingual with a language hint', () => {
    expect(speechOptionsFor('deepgram/flux-general-multi', 'ja')).toEqual({
      model: 'deepgram/flux-general-multi',
      language: 'multi',
      modelOptions: { language_hint: 'ja' },
    });
  });

  it('passes the language straight through for other models', () => {
    expect(speechOptionsFor('deepgram/nova-3', 'es')).toEqual({
      model: 'deepgram/nova-3',
      language: 'es',
      modelOptions: {},
    });
  });
});

describe('ttsOptionsFor', () => {
  it('asks Cartesia for word timestamps so the transcript can follow the audio', () => {
    expect(ttsOptionsFor('cartesia/sonic-3')).toEqual({ add_timestamps: true });
  });

  it('leaves other voices on the default pacing', () => {
    expect(ttsOptionsFor('deepgram/aura-2')).toEqual({});
  });
});
