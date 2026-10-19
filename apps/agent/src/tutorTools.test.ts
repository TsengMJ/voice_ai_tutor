import { InMemorySessionStore, getScenario, type TutorEvent } from '@tutor/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTutorToolHandlers } from './tutorTools.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('tutor tool handlers', () => {
  let store: InMemorySessionStore;
  let events: TutorEvent[];
  let handlers: ReturnType<typeof createTutorToolHandlers>;

  beforeEach(async () => {
    store = new InMemorySessionStore();
    events = [];
    await store.create({
      id: SESSION_ID,
      learnerId: '22222222-2222-4222-8222-222222222222',
      scenarioId: 'coffee-order',
      language: 'en',
      timezone: 'UTC',
      mode: 'voice',
      now: 0,
    });
    handlers = createTutorToolHandlers({
      store,
      sessionId: SESSION_ID,
      scenario: getScenario('coffee-order'),
      publish: async (e) => {
        events.push(e);
      },
      now: () => 1_000,
      newId: () => 'c1',
    });
  });

  it('stores a correction and pushes it to the browser', async () => {
    await handlers.recordCorrection({
      original: 'I want a coffee big',
      corrected: 'I want a large coffee',
      explanation: 'Adjectives come before the noun in English.',
      category: 'word_order',
    });
    expect(await store.listCorrections(SESSION_ID)).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'correction', correction: { id: 'c1' } });
  });

  it('records a known goal and publishes the full completed list', async () => {
    await handlers.completeGoal({ goalId: 'greet' });
    expect(events).toEqual([{ type: 'goals', completed: ['greet'] }]);
  });

  it('tells the model to wrap up once every goal is done', async () => {
    await handlers.completeGoal({ goalId: 'greet' });
    await handlers.completeGoal({ goalId: 'order' });
    const reply = await handlers.completeGoal({ goalId: 'pay' });
    expect(reply).toMatch(/All goals are done/);
  });

  it('rejects goal ids that are not in the scenario without touching state', async () => {
    const reply = await handlers.completeGoal({ goalId: 'dance' });
    expect(reply).toMatch(/Unknown goal id/);
    expect(await store.listGoals(SESSION_ID)).toEqual([]);
  });
});
