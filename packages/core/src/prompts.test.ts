import { describe, expect, it } from 'vitest';
import type { Turn } from './domain.js';
import { buildHintPrompt, buildTutorInstructions, formatTranscript } from './prompts.js';
import { getScenario } from './scenarios.js';

const coffee = getScenario('coffee-order');

describe('buildTutorInstructions', () => {
  it('names the target language and the tutor role', () => {
    const text = buildTutorInstructions({
      scenario: coffee,
      languageCode: 'es',
      completedGoalIds: [],
    });
    expect(text).toContain('Speak only Spanish');
    expect(text).toContain(coffee.tutorRole);
  });

  it('lists every goal id so the model can complete them', () => {
    const text = buildTutorInstructions({
      scenario: coffee,
      languageCode: 'en',
      completedGoalIds: [],
    });
    for (const goal of coffee.goals) expect(text).toContain(`- ${goal.id}:`);
  });

  it('marks goals that were completed before a reconnect', () => {
    const text = buildTutorInstructions({
      scenario: coffee,
      languageCode: 'en',
      completedGoalIds: ['greet'],
    });
    expect(text).toContain('- greet: Greet the barista (already done)');
  });

  it('offers an English fallback only for non-English targets', () => {
    const es = buildTutorInstructions({
      scenario: coffee,
      languageCode: 'es',
      completedGoalIds: [],
    });
    const en = buildTutorInstructions({
      scenario: coffee,
      languageCode: 'en',
      completedGoalIds: [],
    });
    expect(es).toContain('hint in English');
    expect(en).not.toContain('hint in English');
  });

  it('rejects unknown languages loudly', () => {
    expect(() =>
      buildTutorInstructions({ scenario: coffee, languageCode: 'xx', completedGoalIds: [] }),
    ).toThrow(/Unknown language/);
  });
});

describe('formatTranscript', () => {
  it('labels speakers', () => {
    const turns: Turn[] = [
      { id: '1', role: 'tutor', modality: 'voice', text: 'Hi!', interrupted: false, ts: 1 },
      { id: '2', role: 'learner', modality: 'text', text: 'Hello', interrupted: false, ts: 2 },
    ];
    expect(formatTranscript(turns)).toBe('Tutor: Hi!\nLearner: Hello');
  });
});

describe('buildHintPrompt', () => {
  it('asks for a JSON suggestion in the target language', () => {
    const text = buildHintPrompt({ scenario: coffee, languageCode: 'ja', turns: [] });
    expect(text).toContain('"suggestion": "<sentence in Japanese>"');
  });
});
