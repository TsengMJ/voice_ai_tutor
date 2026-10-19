export type SpeechPhase = 'idle' | 'hearing' | 'holding';

/**
 * What to show for the learner between speaking and the transcript arriving.
 * Gemini Live only sends the words after it starts the reply, so the gap needs
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
