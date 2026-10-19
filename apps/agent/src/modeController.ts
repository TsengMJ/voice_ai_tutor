import type { Mode, SessionStore } from '@tutor/core';

export interface ModeControllerDeps {
  store: SessionStore;
  sessionId: string;
  now: () => number;
  /** Turns the agent's microphone input and speech output on or off. */
  applyAudio: (enabled: boolean) => void;
}

/** Owns the current mode and credits voice practice time when it changes. */
export class ModeController {
  private mode: Mode;
  private voiceSince: number | null = null;

  constructor(
    private readonly deps: ModeControllerDeps,
    initialMode: Mode,
  ) {
    this.mode = initialMode;
  }

  get current(): Mode {
    return this.mode;
  }

  start(): void {
    this.apply(this.mode);
  }

  async setMode(mode: Mode): Promise<void> {
    if (mode === this.mode) return;
    await this.creditVoiceTime();
    this.mode = mode;
    this.apply(mode);
    await this.deps.store.setMode(this.deps.sessionId, mode, this.deps.now());
  }

  /** Credits any open voice segment; call on shutdown. */
  async stop(): Promise<void> {
    await this.creditVoiceTime();
  }

  private apply(mode: Mode) {
    this.deps.applyAudio(mode === 'voice');
    this.voiceSince = mode === 'voice' ? this.deps.now() : null;
  }

  private async creditVoiceTime() {
    if (this.voiceSince === null) return;
    const now = this.deps.now();
    const elapsed = now - this.voiceSince;
    this.voiceSince = this.mode === 'voice' ? now : null;
    await this.deps.store.addVoiceMs(this.deps.sessionId, elapsed, now);
  }
}
