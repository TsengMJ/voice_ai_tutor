import type { SessionStore } from '@tutor/core';
import type { Logger } from 'pino';
import type { SessionService } from './services/sessionService.js';

const BATCH_SIZE = 100;

/** Periodically copies changed sessions from Redis to Postgres and closes abandoned ones. */
export class Flusher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly store: SessionStore,
    private readonly sessions: SessionService,
    private readonly logger: Logger,
  ) {}

  start(intervalMs: number) {
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const ended = await this.sessions.sweepStale();
      if (ended > 0) this.logger.info({ ended }, 'closed abandoned sessions');

      const ids = await this.store.takeDirty(BATCH_SIZE);
      for (const id of ids) {
        try {
          await this.sessions.flush(id);
        } catch (err) {
          this.logger.error({ err, sessionId: id }, 'flush failed; will retry');
          await this.store.markDirty(id);
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'flusher tick failed');
    } finally {
      this.running = false;
    }
  }
}
