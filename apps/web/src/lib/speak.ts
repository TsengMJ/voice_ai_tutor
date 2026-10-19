export type Synth = Pick<SpeechSynthesis, 'speak' | 'cancel' | 'getVoices'>;

export type SpeakOutcome = 'started' | 'unsupported' | 'no_voice';

const normalize = (lang: string) => lang.replace('_', '-').toLowerCase();

/**
 * The best installed voice for a BCP 47 tag: an exact match, then any voice for the
 * same base language. `undefined` means the voice list has not loaded yet (Chrome
 * fills it asynchronously), so the browser should pick from `utterance.lang`.
 */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  bcp47: string,
): SpeechSynthesisVoice | null | undefined {
  if (voices.length === 0) return undefined;
  const wanted = normalize(bcp47);
  const base = wanted.split('-')[0];
  return (
    voices.find((v) => normalize(v.lang) === wanted) ??
    voices.find((v) => normalize(v.lang).split('-')[0] === base) ??
    null
  );
}

export function browserSynth(): Synth | undefined {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : undefined;
}

/** Speaks `text` once, replacing anything already playing. `onDone` runs when it ends or is stopped. */
export function speak(
  synth: Synth | undefined,
  text: string,
  bcp47: string,
  onDone: () => void,
): SpeakOutcome {
  if (!synth) return 'unsupported';
  const voice = pickVoice(synth.getVoices(), bcp47);
  if (voice === null) return 'no_voice';
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = bcp47;
  if (voice) utterance.voice = voice;
  utterance.rate = 0.9;
  utterance.onend = onDone;
  utterance.onerror = onDone;
  synth.speak(utterance);
  return 'started';
}
