import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, type SessionState } from '@tutor/core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrate.js';
import { PgStatsRepository } from './repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationsDir = fileURLToPath(new URL('../../../../db/migrations', import.meta.url));

describe.skipIf(!databaseUrl)('PgStatsRepository (requires TEST_DATABASE_URL)', () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const repo = new PgStatsRepository(pool);
  const day = Date.UTC(2026, 9, 19, 9, 0);

  const session = (learnerId: string, overrides: Partial<SessionState> = {}): SessionState => ({
    id: randomUUID(),
    learnerId,
    scenarioId: 'coffee-order',
    language: 'en',
    timezone: 'UTC',
    mode: 'voice',
    status: 'active',
    roomName: '',
    startedAt: day,
    endedAt: null,
    lastActiveAt: day,
    lastTextAt: null,
    voiceMs: 60_000,
    textMs: 30_000,
    latencySumMs: 1_200,
    latencyCount: 2,
    ...overrides,
  });

  const turn = (i: number) => ({
    id: `t${i}`,
    role: i % 2 ? ('learner' as const) : ('tutor' as const),
    modality: 'voice' as const,
    text: `line ${i}`,
    interrupted: false,
    ts: day + i,
  });

  beforeAll(async () => {
    await migrate(pool, migrationsDir);
    await repo.upsertScenarios(SCENARIOS);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('migrations are idempotent', async () => {
    expect(await migrate(pool, migrationsDir)).toEqual([]);
  });

  it('remembers which learners were created with sample history', async () => {
    const demo = randomUUID();
    await repo.ensureLearner(demo, true);
    expect(await repo.isDemoLearner(demo)).toBe(true);
  });

  it('treats unknown learners as not demo', async () => {
    expect(await repo.isDemoLearner(randomUUID())).toBe(false);
  });

  it('flushing the same snapshot twice does not double count', async () => {
    const learnerId = randomUUID();
    const s = session(learnerId);
    const snapshot = {
      session: s,
      turns: [turn(0), turn(1)],
      corrections: [],
      goals: ['greet'],
      summary: null,
    };
    await repo.saveSnapshot(snapshot);
    await repo.saveSnapshot(snapshot);
    const stats = await repo.getDashboard(learnerId, '2026-10-19');
    expect(stats.totals).toMatchObject({ sessions: 1, practiceMs: 90_000, turns: 2, goals: 1 });
  });

  it('later flushes append new turns and keep the stored summary', async () => {
    const learnerId = randomUUID();
    const s = session(learnerId);
    const summary = { headline: 'Nice', strengths: [], focus: [], source: 'model' as const };
    await repo.saveSnapshot({ session: s, turns: [turn(0)], corrections: [], goals: [], summary });
    await repo.saveSnapshot({
      session: s,
      turns: [turn(0), turn(1)],
      corrections: [],
      goals: [],
      summary: null,
    });
    const review = await repo.getReview(s.id);
    expect(review?.turns).toHaveLength(2);
    expect(review?.summary?.headline).toBe('Nice');
  });

  it('builds dashboard aggregates across days', async () => {
    const learnerId = randomUUID();
    const prev = day - 24 * 60 * 60 * 1000;
    await repo.saveSnapshot({
      session: session(learnerId, { startedAt: prev }),
      turns: [turn(0)],
      corrections: [
        {
          id: randomUUID(),
          category: 'tense',
          original: 'a',
          corrected: 'b',
          explanation: 'c',
          ts: prev,
        },
      ],
      goals: [],
      summary: null,
    });
    await repo.saveSnapshot({
      session: session(learnerId),
      turns: [],
      corrections: [],
      goals: [],
      summary: null,
    });

    const stats = await repo.getDashboard(learnerId, '2026-10-19');
    expect(stats.streakDays).toBe(2);
    expect(stats.todayMs).toBe(90_000);
    expect(stats.weekMs).toBe(180_000);
    expect(stats.avgLatencyMs).toBe(600);
    expect(stats.topMistakes).toEqual([{ category: 'tense', count: 1 }]);
    expect(stats.last7Days).toHaveLength(7);
    expect(stats.recent).toHaveLength(2);
  });

  it('assigns sessions to the learner-local day', async () => {
    const learnerId = randomUUID();
    const lateUtc = Date.UTC(2026, 9, 18, 20, 0);
    await repo.saveSnapshot({
      session: session(learnerId, { startedAt: lateUtc, timezone: 'Asia/Taipei' }),
      turns: [],
      corrections: [],
      goals: [],
      summary: null,
    });
    const stats = await repo.getDashboard(learnerId, '2026-10-19');
    expect(stats.todayMs).toBe(90_000);
  });
});
