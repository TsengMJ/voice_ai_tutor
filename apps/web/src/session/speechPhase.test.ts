import { describe, expect, it } from 'vitest';
import { HEARING_HOLD_MS, learnerIsAudible, nextSpeechPhase } from './speechPhase';

describe('nextSpeechPhase', () => {
  it('starts listening the moment the microphone picks up speech', () => {
    expect(nextSpeechPhase('idle', { voice: true, speaking: true, learnerTextReady: false })).toBe(
      'hearing',
    );
  });

  it('holds a placeholder after the learner stops, until their words arrive', () => {
    expect(
      nextSpeechPhase('hearing', { voice: true, speaking: false, learnerTextReady: false }),
    ).toBe('holding');
  });

  it('skips the placeholder when the transcript is already in', () => {
    expect(
      nextSpeechPhase('hearing', { voice: true, speaking: false, learnerTextReady: true }),
    ).toBe('idle');
    expect(
      nextSpeechPhase('holding', { voice: true, speaking: false, learnerTextReady: true }),
    ).toBe('idle');
  });

  it('keeps holding across renders that have no new information', () => {
    expect(
      nextSpeechPhase('holding', { voice: true, speaking: false, learnerTextReady: false }),
    ).toBe('holding');
  });

  it('ignores a brief mic blip and the tutor playing through the speakers', () => {
    expect(
      learnerIsAudible({
        micActive: true,
        micActiveForMs: HEARING_HOLD_MS - 1,
        tutorSpeaking: false,
      }),
    ).toBe(false);
    expect(
      learnerIsAudible({ micActive: true, micActiveForMs: HEARING_HOLD_MS, tutorSpeaking: true }),
    ).toBe(false);
  });

  it('shows listening once the mic has stayed active', () => {
    expect(
      learnerIsAudible({ micActive: true, micActiveForMs: HEARING_HOLD_MS, tutorSpeaking: false }),
    ).toBe(true);
  });

  it('stays idle in text mode', () => {
    expect(
      nextSpeechPhase('hearing', { voice: false, speaking: true, learnerTextReady: false }),
    ).toBe('idle');
  });
});
