import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickVoice, speak, type Synth } from './speak';

const voice = (lang: string, name = lang) => ({ lang, name }) as SpeechSynthesisVoice;

class FakeUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

function fakeSynth(voices: SpeechSynthesisVoice[]) {
  const calls: string[] = [];
  const spoken: FakeUtterance[] = [];
  const synth: Synth = {
    getVoices: () => voices,
    cancel: () => void calls.push('cancel'),
    speak: (u) => {
      calls.push('speak');
      spoken.push(u as unknown as FakeUtterance);
    },
  };
  return { synth, calls, spoken };
}

describe('pickVoice', () => {
  it('prefers an exact language match', () => {
    const voices = [voice('en-GB'), voice('en-US')];
    expect(pickVoice(voices, 'en-US')?.lang).toBe('en-US');
  });

  it('falls back to a voice for the same base language', () => {
    expect(pickVoice([voice('es_MX')], 'es-ES')?.lang).toBe('es_MX');
  });

  it('reports no voice when the language is missing', () => {
    expect(pickVoice([voice('en-US')], 'ja-JP')).toBeNull();
  });

  it('defers to the browser while voices are still loading', () => {
    expect(pickVoice([], 'ja-JP')).toBeUndefined();
  });
});

describe('speak', () => {
  beforeEach(() => vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance));
  afterEach(() => vi.unstubAllGlobals());

  it('speaks the text in the session language with the matching voice', () => {
    const { synth, spoken } = fakeSynth([voice('en-US', 'Samantha')]);
    expect(speak(synth, 'caramel', 'en-US', () => {})).toBe('started');
    expect(spoken[0]).toMatchObject({
      text: 'caramel',
      lang: 'en-US',
      voice: { name: 'Samantha' },
    });
  });

  it('cancels whatever is playing before speaking', () => {
    const { synth, calls } = fakeSynth([voice('en-US')]);
    speak(synth, 'caramel', 'en-US', () => {});
    expect(calls).toEqual(['cancel', 'speak']);
  });

  it('calls onDone when playback ends', () => {
    const { synth, spoken } = fakeSynth([voice('en-US')]);
    const onDone = vi.fn();
    speak(synth, 'caramel', 'en-US', onDone);
    spoken[0]?.onend?.();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('is unsupported without speechSynthesis', () => {
    expect(speak(undefined, 'caramel', 'en-US', () => {})).toBe('unsupported');
  });

  it('does not speak when no voice fits the language', () => {
    const { synth, calls } = fakeSynth([voice('en-US')]);
    expect(speak(synth, 'こんにちは', 'ja-JP', () => {})).toBe('no_voice');
    expect(calls).toEqual([]);
  });
});
