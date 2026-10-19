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

  it('leaves active sessions alone', async () => {
    const { service } = buildTestService();
    await service.create(LEARNER, input);
    expect(await service.sweepStale()).toBe(0);
  });
});
