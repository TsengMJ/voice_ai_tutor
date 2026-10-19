export type SpeechPhase = 'idle' | 'hearing' | 'holding';

/** Room noise trips the mic indicator for a moment. Only a stretch of it counts. */
export const HEARING_HOLD_MS = 450;

/**
 * Whether the learner cue should say they are talking.
 * Speaker bleed while the tutor is talking does not count.
 */
export function learnerIsAudible(input: {
  micActive: boolean;
  micActiveForMs: number;
  tutorSpeaking: boolean;
}): boolean {
  if (input.tutorSpeaking || !input.micActive) return false;
  return input.micActiveForMs >= HEARING_HOLD_MS;
}

/**
 * What to show for the learner between speaking and the transcript arriving.
 * Speech-to-text can still lag a moment after you stop, so the gap needs
 * its own state or the conversation looks frozen.
 */
export function nextSpeechPhase(
  phase: SpeechPhase,
  input: { voice: boolean; speaking: boolean; learnerTextReady: boolean },
): SpeechPhase {
  if (!input.voice) return 'idle';
  if (input.speaking) return 'hearing';
  if (phase === 'hearing') return input.learnerTextReady ? 'idle' : 'holding';
  if (phase === 'holding' && input.learnerTextReady) return 'idle';
  return phase;
}
