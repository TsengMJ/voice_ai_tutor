import { InMemorySessionStore } from '@tutor/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ModeController } from './modeController.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('ModeController', () => {
  let store: InMemorySessionStore;
  let clock: number;
  let audio: boolean[];

  const controller = (initial: 'voice' | 'text') =>
    new ModeController(
      { store, sessionId: SESSION_ID, now: () => clock, applyAudio: (on) => audio.push(on) },
      initial,
    );

  beforeEach(async () => {
    store = new InMemorySessionStore();
    clock = 0;
    audio = [];
    await store.create({
      id: SESSION_ID,
      learnerId: '22222222-2222-4222-8222-222222222222',
      scenarioId: 'coffee-order',
      language: 'en',
      timezone: 'UTC',
      mode: 'voice',
      now: 0,
    });
  });

  it('applies the initial mode on start', () => {
    controller('text').start();
    expect(audio).toEqual([false]);
  });

  it('credits voice time when switching to text', async () => {
    const modes = controller('voice');
    modes.start();
    clock = 30_000;
    await modes.setMode('text');
    expect((await store.get(SESSION_ID))?.voiceMs).toBe(30_000);
    expect((await store.get(SESSION_ID))?.mode).toBe('text');
  });

  it('does not credit voice time while in text mode', async () => {
    const modes = controller('text');
    modes.start();
    clock = 30_000;
    await modes.stop();
    expect((await store.get(SESSION_ID))?.voiceMs).toBe(0);
  });

  it('credits the open voice segment on stop without double counting', async () => {
    const modes = controller('voice');
    modes.start();
    clock = 10_000;
    await modes.stop();
    clock = 15_000;
    await modes.stop();
    expect((await store.get(SESSION_ID))?.voiceMs).toBe(15_000);
  });

  it('ignores a switch to the current mode', async () => {
    const modes = controller('voice');
    modes.start();
    await modes.setMode('voice');
    expect(audio).toEqual([true]);
  });
});
