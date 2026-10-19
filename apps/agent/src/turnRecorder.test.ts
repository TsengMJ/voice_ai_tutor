import { InMemorySessionStore, LIMITS, type Mode, type TutorEvent } from '@tutor/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { TurnRecorder } from './turnRecorder.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('TurnRecorder', () => {
  let store: InMemorySessionStore;
  let events: TutorEvent[];
  let mode: Mode;
  let recorder: TurnRecorder;

  const message = (role: string, text: string | undefined, id = 'm1') => ({
    id,
    role,
    text,
    interrupted: false,
    createdAt: 5_000,
  });

  beforeEach(async () => {
    store = new InMemorySessionStore();
    events = [];
    mode = 'voice';
    await store.create({
      id: SESSION_ID,
      learnerId: '22222222-2222-4222-8222-222222222222',
      scenarioId: 'coffee-order',
      language: 'en',
      timezone: 'UTC',
      mode: 'voice',
      now: 0,
    });
    recorder = new TurnRecorder({
      store,
      sessionId: SESSION_ID,
      publish: async (e) => {
        events.push(e);
      },
      currentMode: () => mode,
    });
  });

  it('labels spoken learner input as voice', async () => {
    const turn = await recorder.record(message('user', 'Hello'));
    expect(turn).toMatchObject({ role: 'learner', modality: 'voice' });
  });

  it('labels typed learner input as text and credits text time', async () => {
    recorder.noteTextInput();
    const turn = await recorder.record(message('user', 'Hello'));
    expect(turn?.modality).toBe('text');
    expect((await store.get(SESSION_ID))?.textMs).toBe(LIMITS.textBurstStartMs);
  });

  it('labels tutor replies with the current mode', async () => {
    mode = 'text';
    const turn = await recorder.record(message('assistant', 'Hi there'));
    expect(turn).toMatchObject({ role: 'tutor', modality: 'text' });
  });

  it('skips empty and non-conversational items', async () => {
    await recorder.record(message('user', '   '));
    await recorder.record(message('system', 'secret'));
    expect(await store.countTurns(SESSION_ID)).toBe(0);
    expect(events).toEqual([]);
  });

  it('persists and publishes the same turn', async () => {
    await recorder.record(message('assistant', 'Welcome!'));
    const [stored] = await store.listTurns(SESSION_ID);
    expect(events).toEqual([{ type: 'turn', turn: stored }]);
  });
});
