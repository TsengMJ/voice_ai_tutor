import { DISCONNECT_GRACE_MS, waitsForReconnect } from '@tutor/core';

export interface DisconnectGraceDeps {
  graceMs?: number;
  /** Stops speech into a room the learner has left. */
  onMute: () => void;
  /** Restores speech for the mode the session was already in. */
  onRestore: () => void;
  /** One line in the existing conversation after the learner returns. */
  onRejoin: () => void;
  /** Grace elapsed. The caller records the reason and leaves the room. */
  onExpire: () => void;
}

/** Holds the agent in the room after an unexpected disconnect, then gives up. */
export class DisconnectGrace {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: DisconnectGraceDeps) {}

  learnerLeft(reason: string | undefined): void {
    if (!waitsForReconnect(reason) || this.timer) return;
    this.deps.onMute();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.deps.onExpire();
    }, this.deps.graceMs ?? DISCONNECT_GRACE_MS);
  }

  learnerReturned(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.deps.onRestore();
    this.deps.onRejoin();
  }

  cancel(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
