import {
  isRedisCommandTimeout,
  retry,
  type Mode,
  type SessionStore,
  type Turn,
  type TutorEvent,
} from '@tutor/core';

export interface ConversationMessage {
  id: string;
  role: string;
  text: string | undefined;
  interrupted: boolean;
  createdAt: number;
}

export interface TurnRecorderDeps {
  store: SessionStore;
  sessionId: string;
  publish: (event: TutorEvent) => Promise<void>;
  currentMode: () => Mode;
  retryDelayMs?: number;
}

/** Persists finished conversation items as transcript turns and mirrors them to the browser. */
export class TurnRecorder {
  private pendingTextInputs = 0;

  constructor(private readonly deps: TurnRecorderDeps) {}

  /** Call when typed input arrives, so the next learner message is labeled as text. */
  noteTextInput(): void {
    this.pendingTextInputs += 1;
  }

  async record(message: ConversationMessage): Promise<Turn | null> {
    const text = message.text?.trim();
    if (!text) return null;
    if (message.role !== 'user' && message.role !== 'assistant') return null;

    let turn: Turn;
    if (message.role === 'user') {
      const typed = this.pendingTextInputs > 0;
      if (typed) this.pendingTextInputs -= 1;
      turn = this.toTurn(message, text, 'learner', typed ? 'text' : 'voice');
      if (typed) {
        await this.withRetry(() =>
          this.deps.store.recordTextActivity(this.deps.sessionId, turn.ts),
        );
      }
    } else {
      turn = this.toTurn(message, text, 'tutor', this.deps.currentMode());
    }

    await this.withRetry(() => this.deps.store.appendTurn(this.deps.sessionId, turn));
    await this.deps.publish({ type: 'turn', turn });
    return turn;
  }

  private withRetry(write: () => Promise<void>) {
    return retry(write, {
      retries: 2,
      delayMs: this.deps.retryDelayMs ?? 250,
      shouldRetry: (err) => !isRedisCommandTimeout(err),
    });
  }

  private toTurn(
    message: ConversationMessage,
    text: string,
    role: Turn['role'],
    modality: Mode,
  ): Turn {
    return {
      id: message.id,
      role,
      modality,
      text,
      interrupted: message.interrupted,
      ts: Math.round(message.createdAt),
    };
  }
}
