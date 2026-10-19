import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { Flusher } from './flusher.js';
import { buildTestService } from './testing/fakes.js';

const LEARNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const input = {
  scenarioId: 'coffee-order',
  language: 'en',
  mode: 'voice' as const,
  timezone: 'UTC',
};
const logger = pino({ level: 'silent' });

describe('Flusher', () => {
  it('releases the claim after a successful flush', async () => {
    const { service, store, repo } = buildTestService();
    const view = await service.create(LEARNER, input);
    await new Flusher(store, service, logger, () => 5_000).tick();
    expect(repo.snapshots.has(view.id)).toBe(true);
    expect(store.claimed.size).toBe(0);
  });

  it('requeues a claim left behind by a replica that died mid-flush', async () => {
    const { service, store, repo } = buildTestService();
    const view = await service.create(LEARNER, input);
    await store.takeDirty(10, 0);

    await new Flusher(store, service, logger, () => 60_000).tick();
    expect(repo.snapshots.has(view.id)).toBe(true);
  });

  it('keeps a recent claim with the replica that holds it', async () => {
    const { service, store, repo } = buildTestService();
    const view = await service.create(LEARNER, input);
    await store.takeDirty(10, 30_000);

    await new Flusher(store, service, logger, () => 60_000).tick();
    expect(repo.snapshots.has(view.id)).toBe(false);
  });

  it('joins a pass that is already running', async () => {
    const { service, store } = buildTestService();
    const flusher = new Flusher(store, service, logger);
    expect(flusher.tick()).toBe(flusher.tick());
  });
});
