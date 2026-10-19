import type { SessionStore } from '@tutor/core';
import type { Logger } from 'pino';
import type { SessionService } from './services/sessionService.js';

const BATCH_SIZE = 100;
/** Longer than one flush under its session lock, so a live claim is never handed to another replica. */
const CLAIM_TIMEOUT_MS = 60_000;

/** Periodically copies changed sessions from Redis to Postgres and closes abandoned ones. */
export class Flusher {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly store: SessionStore,
    private readonly sessions: SessionService,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  start(intervalMs: number) {
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Runs one pass, or joins the pass already in progress. */
  tick(): Promise<void> {
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Waits for a running pass, then runs a final one. */
  async drain(): Promise<void> {
    await this.inFlight;
    await this.tick();
  }

  private async run(): Promise<void> {
    try {
      const ended = await this.sessions.sweepStale();
      if (ended > 0) this.logger.info({ ended }, 'closed abandoned sessions');

      const now = this.now();
      const requeued = await this.store.requeueStaleClaims(now - CLAIM_TIMEOUT_MS);
      if (requeued > 0) this.logger.warn({ requeued }, 'requeued flushes abandoned mid-write');

      const ids = await this.store.takeDirty(BATCH_SIZE, now);
      for (const id of ids) {
        try {
          await this.sessions.flush(id);
        } catch (err) {
          this.logger.error({ err, sessionId: id }, 'flush failed; will retry');
          await this.store.markDirty(id);
        }
        await this.store.ackDirty(id);
      }
    } catch (err) {
      this.logger.error({ err }, 'flusher tick failed');
    }
  }
}
