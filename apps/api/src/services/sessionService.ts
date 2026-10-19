import {
  averageLatencyMs,
  findScenario,
  getScenario,
  isStale,
  isValidTimeZone,
  remainingSessionMs,
  type ConnectionDetails,
  type Hint,
  type Mode,
  type SessionReview,
  type SessionState,
  type SessionStore,
  type SessionView,
} from '@tutor/core';
import type { Logger } from 'pino';
import type { StatsRepository } from '../db/repository.js';
import { AppError, notFound } from '../errors.js';
import { fallbackSummary, type TutorAnalyst } from './analyst.js';
import type { LiveKitGateway } from './livekit.js';
import { LockBusyError, withLock, type Locks } from './locks.js';

/** Lets the agent finish its spoken wrap-up before a timed-out session is closed. */
const TIME_UP_GRACE_MS = 60_000;

/** Covers a Postgres flush plus summary generation. */
const SESSION_LOCK_TTL_MS = 30_000;
/** Covers ending the previous session while starting a new one. */
const LEARNER_LOCK_TTL_MS = 60_000;
const LOCK_WAIT_MS = 15_000;
/** One replica sweeps per lease; the lease is left to expire so staggered timers do not repeat it. */
const SWEEP_LEASE_MS = 10_000;

const sessionLock = (sessionId: string) => `flush:${sessionId}`;
const learnerLock = (learnerId: string) => `learner:${learnerId}`;

export interface SessionServiceDeps {
  store: SessionStore;
  repo: StatsRepository;
  livekit: LiveKitGateway;
  analyst: TutorAnalyst;
  locks: Locks;
  logger: Logger;
  now: () => number;
  newId: () => string;
}

function busyAsConflict(err: unknown): never {
  if (err instanceof LockBusyError) {
    throw new AppError(409, 'busy', 'This session is still being saved. Try again in a moment.');
  }
  throw err;
}

export interface CreateSessionInput {
  scenarioId: string;
  language: string;
  mode: Mode;
  timezone: string;
}

export class SessionService {
  constructor(private readonly deps: SessionServiceDeps) {}

  async create(learnerId: string, input: CreateSessionInput): Promise<SessionView> {
    if (!findScenario(input.scenarioId)) {
      throw new AppError(400, 'unknown_scenario', `Unknown scenario: ${input.scenarioId}`);
    }
    if (!isValidTimeZone(input.timezone)) {
      throw new AppError(400, 'invalid_timezone', `Unknown time zone: ${input.timezone}`);
    }
    const lock = { ttlMs: LEARNER_LOCK_TTL_MS, waitMs: LOCK_WAIT_MS };
    return withLock(this.deps.locks, learnerLock(learnerId), lock, async () => {
      const previous = await this.deps.store.getActiveSession(learnerId);
      if (previous) await this.endInternal(previous, LOCK_WAIT_MS);

      const session = await this.deps.store.create({
        id: this.deps.newId(),
        learnerId,
        ...input,
        now: this.deps.now(),
      });
      await this.deps.store.setActiveSession(learnerId, session.id);
      return this.toView(session, 0, []);
    }).catch(busyAsConflict);
  }

  async connect(learnerId: string, sessionId: string, mode: Mode): Promise<ConnectionDetails> {
    const session = await this.requireActive(learnerId, sessionId);
    const now = this.deps.now();
    const remainingMs = remainingSessionMs(session.startedAt, now);
    if (remainingMs === 0) {
      await this.endInternal(sessionId, LOCK_WAIT_MS).catch(busyAsConflict);
      throw new AppError(409, 'time_up', 'This session has reached its time limit.');
    }
    const roomName = `tutor-${sessionId}-${this.deps.newId().slice(0, 8)}`;
    await this.deps.store.setRoom(sessionId, roomName, now);
    await this.deps.store.setMode(sessionId, mode, now);
    const token = await this.deps.livekit.issueToken({
      identity: learnerId,
      roomName,
      metadata: { sessionId },
    });
    return { serverUrl: this.deps.livekit.serverUrl, roomName, token, remainingMs };
  }

  async hint(learnerId: string, sessionId: string): Promise<Hint> {
    const session = await this.requireActive(learnerId, sessionId);
    const turns = await this.deps.store.listTurns(sessionId, 12);
    try {
      return await this.deps.analyst.hint({
        scenario: getScenario(session.scenarioId),
        languageCode: session.language,
        turns,
      });
    } catch (err) {
      this.deps.logger.warn({ err, sessionId }, 'hint generation failed');
      throw new AppError(
        503,
        'hint_unavailable',
        'Hints are unavailable right now. Try again shortly.',
      );
    }
  }

  async end(learnerId: string, sessionId: string): Promise<SessionReview> {
    const session = await this.deps.store.get(sessionId);
    if (session && session.learnerId !== learnerId) throw notFound('Session');
    if (session) await this.endInternal(sessionId, LOCK_WAIT_MS).catch(busyAsConflict);
    return this.review(learnerId, sessionId);
  }

  async review(learnerId: string, sessionId: string): Promise<SessionReview> {
    const live = await this.deps.store.get(sessionId);
    if (live && live.learnerId !== learnerId) throw notFound('Session');

    if (!live || live.status === 'ended') {
      const stored = await this.deps.repo.getReview(sessionId);
      if (stored && stored.learnerId === learnerId) {
        return {
          session: stored.session,
          turns: stored.turns,
          corrections: stored.corrections,
          summary: stored.summary,
        };
      }
      if (!live) throw notFound('Session');
    }

    const [turns, corrections, goals] = await Promise.all([
      this.deps.store.listTurns(sessionId),
      this.deps.store.listCorrections(sessionId),
      this.deps.store.listGoals(sessionId),
    ]);
    return { session: this.toView(live, turns.length, goals), turns, corrections, summary: null };
  }

  /** The learner's resumable session, if one is still running. */
  async activeSessionId(learnerId: string): Promise<string | null> {
    const id = await this.deps.store.getActiveSession(learnerId);
    if (!id) return null;
    const session = await this.deps.store.get(id);
    const alive =
      session?.status === 'active' && remainingSessionMs(session.startedAt, this.deps.now()) > 0;
    return alive ? id : null;
  }

  /**
   * Copies the hot Redis state for a session into Postgres, writing only turns not yet stored.
   * When another replica holds the session, it is re-queued for the next tick.
   */
  async flush(sessionId: string): Promise<void> {
    try {
      await withLock(this.deps.locks, sessionLock(sessionId), { ttlMs: SESSION_LOCK_TTL_MS }, () =>
        this.flushLocked(sessionId),
      );
    } catch (err) {
      if (!(err instanceof LockBusyError)) throw err;
      await this.deps.store.markDirty(sessionId);
    }
  }

  private async flushLocked(sessionId: string): Promise<void> {
    const session = await this.deps.store.get(sessionId);
    if (!session) return;
    const firstSeq = await this.deps.repo.nextTurnSeq(sessionId);
    const [turns, corrections, goals] = await Promise.all([
      this.deps.store.listTurnsFrom(sessionId, firstSeq),
      this.deps.store.listCorrections(sessionId),
      this.deps.store.listGoals(sessionId),
    ]);
    await this.deps.repo.saveSnapshot({
      session,
      firstSeq,
      turns,
      corrections,
      goals,
      summary: null,
    });
  }

  /** Ends sessions the learner abandoned or that ran past their time limit. */
  async sweepStale(): Promise<number> {
    if (!(await this.deps.locks.acquire('sweep', SWEEP_LEASE_MS))) return 0;
    const now = this.deps.now();
    let ended = 0;
    for (const id of await this.deps.store.listActiveSessionIds()) {
      const session = await this.deps.store.get(id);
      if (!session) {
        await this.deps.store.end(id, now);
        continue;
      }
      const timeUp =
        remainingSessionMs(session.startedAt, now) === 0 &&
        now - session.lastActiveAt > TIME_UP_GRACE_MS;
      if (session.endReason || isStale(session.lastActiveAt, now) || timeUp) {
        try {
          if (await this.endInternal(id, 0)) ended += 1;
        } catch (err) {
          if (!(err instanceof LockBusyError)) throw err;
        }
      }
    }
    return ended;
  }

  /** Returns true when this call ended the session. Throws LockBusyError after `waitMs`. */
  private endInternal(sessionId: string, waitMs: number): Promise<boolean> {
    const lock = { ttlMs: SESSION_LOCK_TTL_MS, waitMs };
    return withLock(this.deps.locks, sessionLock(sessionId), lock, () => this.endLocked(sessionId));
  }

  private async endLocked(sessionId: string): Promise<boolean> {
    const before = await this.deps.store.get(sessionId);
    if (!before || before.status === 'ended') return false;
    const session = await this.deps.store.end(sessionId, this.deps.now());
    if (!session) return false;

    const [turns, corrections, goals] = await Promise.all([
      this.deps.store.listTurns(sessionId),
      this.deps.store.listCorrections(sessionId),
      this.deps.store.listGoals(sessionId),
    ]);
    const summary = await this.deps.analyst
      .summarize({
        scenario: getScenario(session.scenarioId),
        languageCode: session.language,
        turns,
        corrections,
      })
      .catch((err) => {
        this.deps.logger.warn({ err, sessionId }, 'summary generation failed; using fallback');
        return fallbackSummary(corrections);
      });
    await this.deps.repo.saveSnapshot({
      session,
      turns,
      corrections,
      goals,
      summary: session.endReason ? { ...summary, endReason: session.endReason } : summary,
    });

    if (session.roomName) {
      await this.deps.livekit.deleteRoom(session.roomName).catch((err) => {
        this.deps.logger.debug({ err, sessionId }, 'room already gone');
      });
    }
    return true;
  }

  private async requireActive(learnerId: string, sessionId: string): Promise<SessionState> {
    const session = await this.deps.store.get(sessionId);
    if (!session || session.learnerId !== learnerId) throw notFound('Session');
    if (session.status !== 'active') {
      throw new AppError(409, 'session_ended', 'This session has already ended.');
    }
    return session;
  }

  private toView(session: SessionState, turnCount: number, goals: string[]): SessionView {
    return {
      id: session.id,
      scenarioId: session.scenarioId,
      language: session.language,
      mode: session.mode,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      voiceMs: session.voiceMs,
      textMs: session.textMs,
      turnCount,
      completedGoals: goals,
      avgLatencyMs: averageLatencyMs(session),
      remainingMs:
        session.status === 'active' ? remainingSessionMs(session.startedAt, this.deps.now()) : 0,
    };
  }
}
