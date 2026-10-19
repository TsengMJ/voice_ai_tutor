import { describe, expect, it } from 'vitest';
import {
  IDLE_CONFIRM_MS,
  SILENCE_BEFORE_PROMPT_MS,
  idlePromptIdle,
  stepIdlePrompt,
  type IdlePromptState,
} from './idlePrompt.js';

const quiet = (state: IdlePromptState, now: number) =>
  stepIdlePrompt(state, { now, quiet: true, acknowledged: false });

describe('stepIdlePrompt', () => {
  it('waits through 30 seconds of silence before asking', () => {
    const started = quiet(idlePromptIdle, 0);
    expect(started.kind).toBe('idle');
    const still = quiet(started.state, SILENCE_BEFORE_PROMPT_MS - 1);
    expect(still.kind).toBe('idle');
    const ask = quiet(still.state, SILENCE_BEFORE_PROMPT_MS);
    expect(ask.kind).toBe('confirm');
    if (ask.kind === 'confirm') expect(ask.remainingMs).toBe(IDLE_CONFIRM_MS);
  });

  it('closes 15 seconds after the prompt if the learner does not continue', () => {
    const ask = quiet(quiet(idlePromptIdle, 0).state, SILENCE_BEFORE_PROMPT_MS);
    const open = quiet(ask.state, SILENCE_BEFORE_PROMPT_MS + IDLE_CONFIRM_MS - 1);
    expect(open.kind).toBe('confirm');
    const closed = quiet(ask.state, SILENCE_BEFORE_PROMPT_MS + IDLE_CONFIRM_MS);
    expect(closed.kind).toBe('close');
  });

  it('restarts the 30 seconds when the learner chooses to continue', () => {
    const ask = quiet(quiet(idlePromptIdle, 0).state, SILENCE_BEFORE_PROMPT_MS);
    const kept = stepIdlePrompt(ask.state, {
      now: SILENCE_BEFORE_PROMPT_MS,
      quiet: true,
      acknowledged: true,
    });
    expect(kept.kind).toBe('idle');
    const later = quiet(kept.state, SILENCE_BEFORE_PROMPT_MS + SILENCE_BEFORE_PROMPT_MS - 1);
    expect(later.kind).toBe('idle');
  });

  it('drops the prompt when someone starts speaking', () => {
    const ask = quiet(quiet(idlePromptIdle, 0).state, SILENCE_BEFORE_PROMPT_MS);
    const talking = stepIdlePrompt(ask.state, {
      now: SILENCE_BEFORE_PROMPT_MS + 1_000,
      quiet: false,
      acknowledged: false,
    });
    expect(talking).toEqual({ kind: 'idle', state: idlePromptIdle });
  });

  it('does not count time while the conversation is active', () => {
    const paused = stepIdlePrompt(idlePromptIdle, { now: 0, quiet: false, acknowledged: false });
    const resumed = quiet(paused.state, 60_000);
    expect(resumed.kind).toBe('idle');
    expect(resumed.state.quietSince).toBe(60_000);
  });
});
