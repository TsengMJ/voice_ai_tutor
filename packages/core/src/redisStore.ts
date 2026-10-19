import type { ChainableCommander, Redis } from 'ioredis';
import {
  CorrectionSchema,
  LIMITS,
  SessionStateSchema,
  TurnSchema,
  type Correction,
  type Mode,
  type SessionState,
  type Turn,
} from './domain.js';
import type { NewSession, SessionStore } from './store.js';
import { textActivityIncrementMs } from './timing.js';

export const redisKeys = {
  session: (id: string) => `session:${id}`,
  turns: (id: string) => `session:${id}:turns`,
  corrections: (id: string) => `session:${id}:corrections`,
  goals: (id: string) => `session:${id}:goals`,
  learnerActive: (learnerId: string) => `learner:${learnerId}:active`,
  activeSessions: 'sessions:active',
  flushPending: 'flush:pending',
};

const NULLABLE_NUMBER_FIELDS = new Set(['endedAt', 'lastTextAt']);
const NUMBER_FIELDS = new Set([
  'startedAt',
  'endedAt',
  'lastActiveAt',
  'lastTextAt',
  'voiceMs',
  'textMs',
  'latencySumMs',
  'latencyCount',
]);

function toHash(session: SessionState): Record<string, string> {
  return Object.fromEntries(
    Object.entries(session).map(([k, v]) => [k, v === null ? '' : String(v)]),
  );
}

function fromHash(hash: Record<string, string>): SessionState {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(hash)) {
    if (NULLABLE_NUMBER_FIELDS.has(k) && v === '') raw[k] = null;
    else if (NUMBER_FIELDS.has(k)) raw[k] = Number(v);
    else raw[k] = v;
  }
  return SessionStateSchema.parse(raw);
}

function parseList<T>(items: string[], schema: { parse: (v: unknown) => T }): T[] {
  return items.map((item) => schema.parse(JSON.parse(item)));
}

export class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: Redis) {}

  private touch(tx: ChainableCommander, id: string, now?: number) {
    if (now !== undefined) tx.hset(redisKeys.session(id), 'lastActiveAt', String(now));
    const ttl = LIMITS.sessionTtlSeconds;
    tx.expire(redisKeys.session(id), ttl);
    tx.expire(redisKeys.turns(id), ttl);
    tx.expire(redisKeys.corrections(id), ttl);
    tx.expire(redisKeys.goals(id), ttl);
    tx.sadd(redisKeys.flushPending, id);
    return tx;
  }

  async create(input: NewSession): Promise<SessionState> {
    const session: SessionState = {
      id: input.id,
      learnerId: input.learnerId,
      scenarioId: input.scenarioId,
      language: input.language,
      timezone: input.timezone,
      mode: input.mode,
      status: 'active',
      roomName: '',
      startedAt: input.now,
      endedAt: null,
      lastActiveAt: input.now,
      lastTextAt: null,
      voiceMs: 0,
      textMs: 0,
      latencySumMs: 0,
      latencyCount: 0,
    };
    const tx = this.redis.multi().hset(redisKeys.session(input.id), toHash(session));
    tx.sadd(redisKeys.activeSessions, input.id);
    await this.touch(tx, input.id).exec();
    return session;
  }

  async get(id: string): Promise<SessionState | null> {
    const hash = await this.redis.hgetall(redisKeys.session(id));
    if (Object.keys(hash).length === 0) return null;
    return fromHash(hash);
  }

  async setMode(id: string, mode: Mode, now: number): Promise<void> {
    const tx = this.redis.multi().hset(redisKeys.session(id), 'mode', mode);
    await this.touch(tx, id, now).exec();
  }

  async setRoom(id: string, roomName: string, now: number): Promise<void> {
    const tx = this.redis.multi().hset(redisKeys.session(id), 'roomName', roomName);
    await this.touch(tx, id, now).exec();
  }

  async appendTurn(id: string, turn: Turn): Promise<void> {
    const tx = this.redis
      .multi()
      .rpush(redisKeys.turns(id), JSON.stringify(TurnSchema.parse(turn)));
    await this.touch(tx, id, turn.ts).exec();
  }

  async listTurns(id: string, limit?: number): Promise<Turn[]> {
    const start = limit === undefined ? 0 : -limit;
    return parseList(await this.redis.lrange(redisKeys.turns(id), start, -1), TurnSchema);
  }

  countTurns(id: string): Promise<number> {
    return this.redis.llen(redisKeys.turns(id));
  }

  async addCorrection(id: string, correction: Correction): Promise<void> {
    const payload = JSON.stringify(CorrectionSchema.parse(correction));
    const tx = this.redis.multi().rpush(redisKeys.corrections(id), payload);
    await this.touch(tx, id, correction.ts).exec();
  }

  async listCorrections(id: string): Promise<Correction[]> {
    return parseList(await this.redis.lrange(redisKeys.corrections(id), 0, -1), CorrectionSchema);
  }

  async completeGoal(id: string, goalId: string): Promise<string[]> {
    const tx = this.redis.multi().sadd(redisKeys.goals(id), goalId);
    await this.touch(tx, id).exec();
    return this.listGoals(id);
  }

  async listGoals(id: string): Promise<string[]> {
    return (await this.redis.smembers(redisKeys.goals(id))).sort();
  }

  async addVoiceMs(id: string, ms: number, now: number): Promise<void> {
    if (ms <= 0) return;
    const tx = this.redis.multi().hincrby(redisKeys.session(id), 'voiceMs', Math.round(ms));
    await this.touch(tx, id, now).exec();
  }

  async recordTextActivity(id: string, now: number): Promise<void> {
    const lastTextAt = await this.redis.hget(redisKeys.session(id), 'lastTextAt');
    const increment = textActivityIncrementMs(lastTextAt ? Number(lastTextAt) : null, now);
    const tx = this.redis
      .multi()
      .hincrby(redisKeys.session(id), 'textMs', increment)
      .hset(redisKeys.session(id), 'lastTextAt', String(now));
    await this.touch(tx, id, now).exec();
  }

  async recordLatency(id: string, ms: number): Promise<void> {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const tx = this.redis
      .multi()
      .hincrby(redisKeys.session(id), 'latencySumMs', Math.round(ms))
      .hincrby(redisKeys.session(id), 'latencyCount', 1);
    await this.touch(tx, id).exec();
  }

  async end(id: string, now: number): Promise<SessionState | null> {
    await this.redis.srem(redisKeys.activeSessions, id);
    const session = await this.get(id);
    if (!session) return null;
    if (session.status === 'ended') return session;
    const tx = this.redis
      .multi()
      .hset(redisKeys.session(id), { status: 'ended', endedAt: String(now) })
      .srem(redisKeys.activeSessions, id);
    await this.touch(tx, id, now).exec();
    await this.clearActiveSession(session.learnerId, id);
    return { ...session, status: 'ended', endedAt: now, lastActiveAt: now };
  }

  async setActiveSession(learnerId: string, sessionId: string): Promise<void> {
    await this.redis.set(
      redisKeys.learnerActive(learnerId),
      sessionId,
      'EX',
      LIMITS.sessionTtlSeconds,
    );
  }

  getActiveSession(learnerId: string): Promise<string | null> {
    return this.redis.get(redisKeys.learnerActive(learnerId));
  }

  async clearActiveSession(learnerId: string, sessionId: string): Promise<void> {
    const key = redisKeys.learnerActive(learnerId);
    if ((await this.redis.get(key)) === sessionId) await this.redis.del(key);
  }

  listActiveSessionIds(): Promise<string[]> {
    return this.redis.smembers(redisKeys.activeSessions);
  }

  async markDirty(id: string): Promise<void> {
    await this.redis.sadd(redisKeys.flushPending, id);
  }

  async takeDirty(max: number): Promise<string[]> {
    const ids = await this.redis.spop(redisKeys.flushPending, max);
    return ids ?? [];
  }
}
