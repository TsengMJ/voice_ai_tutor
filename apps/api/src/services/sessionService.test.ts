import { LIMITS } from '@tutor/core';
import { describe, expect, it } from 'vitest';
import { buildTestService } from '../testing/fakes.js';

const LEARNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const input = {
  scenarioId: 'coffee-order',
  language: 'en',
  mode: 'voice' as const,
  timezone: 'UTC',
};

describe('SessionService.create', () => {
  it('creates an active session and remembers it for resuming', async () => {
    const { service } = buildTestService();
    const view = await service.create(LEARNER, input);
    expect(view.status).toBe('active');
    expect(await service.activeSessionId(LEARNER)).toBe(view.id);
  });

  it('rejects unknown scenarios', async () => {
    const { service } = buildTestService();
    await expect(service.create(LEARNER, { ...input, scenarioId: 'nope' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects invalid time zones', async () => {
    const { service } = buildTestService();
    await expect(
      service.create(LEARNER, { ...input, timezone: 'Not/AZone' }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('ends the previous active session when a new one starts', async () => {
    const { service, store } = buildTestService();
    const first = await service.create(LEARNER, input);
    await service.create(LEARNER, input);
    expect((await store.get(first.id))?.status).toBe('ended');
  });

  it('leaves one active session when two creates race', async () => {
    const { service, store } = buildTestService();
    await Promise.all([service.create(LEARNER, input), service.create(LEARNER, input)]);
    expect(await store.listActiveSessionIds()).toHaveLength(1);
  });
});

describe('SessionService.flush', () => {
  const turn = (i: number) => ({
    id: `t${i}`,
    role: 'learner' as const,
    modality: 'text' as const,
    text: `line ${i}`,
    interrupted: false,
    ts: 1_000_000 + i,
  });

  it('reads only turns after the persisted sequence', async () => {
    const { service, store, repo } = buildTestService();
    const view = await service.create(LEARNER, input);
    for (const i of [0, 1, 2]) await store.appendTurn(view.id, turn(i));
    await service.flush(view.id);
    for (const i of [3, 4]) await store.appendTurn(view.id, turn(i));
    await service.flush(view.id);

    expect(repo.saved.at(-1)).toMatchObject({ firstSeq: 3, turns: [turn(3), turn(4)] });
    expect(repo.snapshots.get(view.id)?.turns).toHaveLength(5);
  });

  it('re-queues the session when another replica holds it', async () => {
    const { service, store, repo, locks } = buildTestService();
    const view = await service.create(LEARNER, input);
    store.dirty.clear();
    await locks.acquire(`flush:${view.id}`, 60_000);

    await service.flush(view.id);
    expect(repo.saved).toHaveLength(0);
    expect(store.dirty.has(view.id)).toBe(true);
  });
});

describe('SessionService.connect', () => {
  it('issues a token for a fresh room bound to the session', async () => {
    const { service, livekit, store } = buildTestService();
    const view = await service.create(LEARNER, input);
    const details = await service.connect(LEARNER, view.id, 'text');
    expect(livekit.issued[0]).toEqual({
      identity: LEARNER,
      roomName: details.roomName,
      sessionId: view.id,
    });
    expect((await store.get(view.id))?.roomName).toBe(details.roomName);
    expect((await store.get(view.id))?.mode).toBe('text');
  });

  it('hides sessions owned by other learners', async () => {
    const { service } = buildTestService();
    const view = await service.create(LEARNER, input);
    await expect(service.connect(OTHER, view.id, 'voice')).rejects.toMatchObject({ status: 404 });
  });

  it('refuses and ends sessions past the time limit', async () => {
    let now = 0;
    const { service, store } = buildTestService({ now: () => now });
    const view = await service.create(LEARNER, input);
    now = LIMITS.maxSessionMs + 1;
    await expect(service.connect(LEARNER, view.id, 'voice')).rejects.toMatchObject({ status: 409 });
    expect((await store.get(view.id))?.status).toBe('ended');
  });
});

describe('SessionService.end', () => {
  it('stores a model summary in Postgres and frees the room', async () => {
    const { service, repo, livekit } = buildTestService();
    const view = await service.create(LEARNER, input);
    const { roomName } = await service.connect(LEARNER, view.id, 'voice');
    const review = await service.end(LEARNER, view.id);
    expect(review.summary?.source).toBe('model');
    expect(repo.snapshots.get(view.id)?.session.status).toBe('ended');
    expect(livekit.deleted).toEqual([roomName]);
  });

  it('falls back to a deterministic summary when the model fails', async () => {
    const { service, analyst } = buildTestService();
    const view = await service.create(LEARNER, input);
    analyst.failNext = true;
    const review = await service.end(LEARNER, view.id);
    expect(review.summary?.source).toBe('fallback');
  });

  it('is idempotent and does not regenerate the summary', async () => {
    const { service, analyst } = buildTestService();
    const view = await service.create(LEARNER, input);
    await service.end(LEARNER, view.id);
    await service.end(LEARNER, view.id);
    expect(analyst.summarizeCalls).toBe(1);
  });
});

describe('SessionService.hint', () => {
  it('maps model failures to a 503 the UI can show', async () => {
    const { service, analyst } = buildTestService();
    const view = await service.create(LEARNER, input);
    analyst.failNext = true;
    await expect(service.hint(LEARNER, view.id)).rejects.toMatchObject({ status: 503 });
  });
});

describe('SessionService.sweepStale', () => {
  it('ends sessions idle longer than the stale window', async () => {
    let now = 0;
    const { service, store } = buildTestService({ now: () => now });
    const view = await service.create(LEARNER, input);
    now = LIMITS.staleSessionMs + 1;
    expect(await service.sweepStale()).toBe(1);
    expect((await store.get(view.id))?.status).toBe('ended');
  });

  it('ends a session the agent marked after the reconnect grace', async () => {
    const { service, store, repo } = buildTestService();
    const view = await service.create(LEARNER, input);
    await store.setEndReason(view.id, 'abnormal_client_disconnect');
    expect(await service.sweepStale()).toBe(1);
    expect((await store.get(view.id))?.status).toBe('ended');
    expect(repo.snapshots.get(view.id)?.summary?.endReason).toBe('abnormal_client_disconnect');
  });

  it('leaves active sessions alone', async () => {
    const { service } = buildTestService();
    await service.create(LEARNER, input);
    expect(await service.sweepStale()).toBe(0);
  });

  it('skips a stale session another replica is saving', async () => {
    let now = 0;
    const { service, store, locks } = buildTestService({ now: () => now });
    const view = await service.create(LEARNER, input);
    await locks.acquire(`flush:${view.id}`, 60_000);
    now = LIMITS.staleSessionMs + 1;
    expect(await service.sweepStale()).toBe(0);
    expect((await store.get(view.id))?.status).toBe('active');
  });

  it('runs once per lease across replicas', async () => {
    let now = 0;
    const { service, locks } = buildTestService({ now: () => now });
    await service.create(LEARNER, input);
    await locks.acquire('sweep', 60_000);
    now = LIMITS.staleSessionMs + 1;
    expect(await service.sweepStale()).toBe(0);
  });
});
