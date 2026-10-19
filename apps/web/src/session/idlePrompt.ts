/** Quiet time with nobody speaking before we ask whether to keep going. */
export const SILENCE_BEFORE_PROMPT_MS = 30_000;
/** How long the confirmation stays up before the session closes. */
export const IDLE_CONFIRM_MS = 15_000;

export interface IdlePromptState {
  quietSince: number | null;
  confirmDeadline: number | null;
}

export const idlePromptIdle: IdlePromptState = { quietSince: null, confirmDeadline: null };

export type IdlePromptStep =
  | { kind: 'idle'; state: IdlePromptState }
  | { kind: 'confirm'; state: IdlePromptState; remainingMs: number }
  | { kind: 'close'; state: IdlePromptState };

/**
 * `quiet` means the room is connected, voice mode is on, and neither side is speaking.
 * `acknowledged` is the learner choosing to continue.
 */
export function stepIdlePrompt(
  state: IdlePromptState,
  input: { now: number; quiet: boolean; acknowledged: boolean },
): IdlePromptStep {
  if (input.acknowledged || !input.quiet) {
    return {
      kind: 'idle',
      state: {
        quietSince: input.quiet && input.acknowledged ? input.now : null,
        confirmDeadline: null,
      },
    };
  }

  const quietSince = state.quietSince ?? input.now;
  if (state.confirmDeadline === null) {
    if (input.now - quietSince < SILENCE_BEFORE_PROMPT_MS) {
      return { kind: 'idle', state: { quietSince, confirmDeadline: null } };
    }
    const confirmDeadline = input.now + IDLE_CONFIRM_MS;
    return {
      kind: 'confirm',
      remainingMs: IDLE_CONFIRM_MS,
      state: { quietSince, confirmDeadline },
    };
  }

  const remainingMs = state.confirmDeadline - input.now;
  if (remainingMs <= 0) return { kind: 'close', state };
  return { kind: 'confirm', remainingMs, state };
}
