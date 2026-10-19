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

  it('reads turns from a sequence number to the end', async () => {
    for (let i = 0; i < 4; i++) {
      await store.appendTurn(sessionId, {
        id: `t${i}`,
        role: 'learner',
        modality: 'text',
        text: `turn ${i}`,
        interrupted: false,
        ts: 2_000 + i,
      });
    }
    expect((await store.listTurnsFrom(sessionId, 2)).map((t) => t.id)).toEqual(['t2', 't3']);
    expect(await store.listTurnsFrom(sessionId, 4)).toEqual([]);
  });

  it('keeps an active pointer that already moved to a newer session', async () => {
    const newer = randomUUID();
    await store.setActiveSession(learnerId, newer);
    await store.clearActiveSession(learnerId, sessionId);
    expect(await store.getActiveSession(learnerId)).toBe(newer);
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

  it('returns a claim abandoned before its flush to the dirty set', async () => {
    await redis.del(redisKeys.flushPending, redisKeys.flushClaimed);
    await store.markDirty(sessionId);
    expect(await store.takeDirty(10, 1_000)).toEqual([sessionId]);
    expect(await store.requeueStaleClaims(999)).toBe(0);

    expect(await store.requeueStaleClaims(1_000)).toBe(1);
    expect(await store.takeDirty(10, 2_000)).toEqual([sessionId]);
  });

  it('forgets an acknowledged claim', async () => {
    await redis.del(redisKeys.flushPending, redisKeys.flushClaimed);
    await store.markDirty(sessionId);
    await store.takeDirty(10, 1_000);
    await store.ackDirty(sessionId);
    expect(await store.requeueStaleClaims(Number.MAX_SAFE_INTEGER)).toBe(0);
    expect(await store.takeDirty(10, 2_000)).toEqual([]);
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
