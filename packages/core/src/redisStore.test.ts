import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS } from './domain.js';
import { RedisSessionStore, redisKeys } from './redisStore.js';

const redisUrl = process.env.REDIS_URL;

describe.skipIf(!redisUrl)('RedisSessionStore (requires REDIS_URL)', () => {
  const redis = new Redis(redisUrl ?? '', { lazyConnect: true });
  const store = new RedisSessionStore(redis);
  let sessionId: string;
  const learnerId = randomUUID();

  beforeEach(async () => {
    sessionId = randomUUID();
    await store.create({
      id: sessionId,
      learnerId,
      scenarioId: 'coffee-order',
      language: 'en',
      timezone: 'UTC',
      mode: 'voice',
      now: 1_000,
    });
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('round-trips the session hash', async () => {
    const session = await store.get(sessionId);
    expect(session).toMatchObject({ id: sessionId, status: 'active', endedAt: null, voiceMs: 0 });
  });

  it('returns only the most recent turns when a limit is given', async () => {
    for (let i = 0; i < 5; i++) {
      await store.appendTurn(sessionId, {
        id: `t${i}`,
        role: i % 2 ? 'learner' : 'tutor',
        modality: 'voice',
        text: `turn ${i}`,
        interrupted: false,
        ts: 2_000 + i,
      });
    }
    const turns = await store.listTurns(sessionId, 2);
    expect(turns.map((t) => t.id)).toEqual(['t3', 't4']);
  });

  it('deduplicates completed goals', async () => {
    await store.completeGoal(sessionId, 'greet');
    expect(await store.completeGoal(sessionId, 'greet')).toEqual(['greet']);
  });

  it('accumulates text activity using burst rules', async () => {
    await store.recordTextActivity(sessionId, 10_000);
    await store.recordTextActivity(sessionId, 20_000);
    expect((await store.get(sessionId))?.textMs).toBe(LIMITS.textBurstStartMs + 10_000);
  });

  it('marks writes as pending a flush', async () => {
    await store.setMode(sessionId, 'text', 5_000);
    expect(await redis.sismember(redisKeys.flushPending, sessionId)).toBe(1);
  });

  it('ending a session clears the learner active pointer', async () => {
    await store.setActiveSession(learnerId, sessionId);
    const ended = await store.end(sessionId, 9_000);
    expect(ended?.status).toBe('ended');
    expect(await store.getActiveSession(learnerId)).toBeNull();
  });

  it('applies a TTL so abandoned state expires', async () => {
    expect(await redis.ttl(redisKeys.session(sessionId))).toBeGreaterThan(0);
  });
});
