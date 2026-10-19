import { describe, expect, it } from 'vitest';
import { FakeRepository } from '../testing/fakes.js';
import { seedDemoHistory } from './demo.js';

const NOW = Date.UTC(2026, 9, 19, 12);
const LEARNER_A = '11111111-1111-4111-8111-111111111111';
const LEARNER_B = '22222222-2222-4222-8222-222222222222';

function idFactory() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

describe('seedDemoHistory', () => {
  it('seeds ten ended sessions for the learner', async () => {
    const repo = new FakeRepository();
    await seedDemoHistory(repo, NOW, LEARNER_A, idFactory());
    expect(await repo.countSessions(LEARNER_A)).toBe(10);
  });

  it('marks the learner as demo', async () => {
    const repo = new FakeRepository();
    await seedDemoHistory(repo, NOW, LEARNER_A, idFactory());
    expect(await repo.isDemoLearner(LEARNER_A)).toBe(true);
  });

  it('does nothing for a learner who already has history', async () => {
    const repo = new FakeRepository();
    const newId = idFactory();
    await seedDemoHistory(repo, NOW, LEARNER_A, newId);
    expect(await seedDemoHistory(repo, NOW, LEARNER_A, newId)).toBe(false);
  });

  it('keeps each learner’s sample history separate', async () => {
    const repo = new FakeRepository();
    const newId = idFactory();
    await seedDemoHistory(repo, NOW, LEARNER_A, newId);
    await seedDemoHistory(repo, NOW, LEARNER_B, newId);
    expect(await repo.countSessions(LEARNER_B)).toBe(10);
  });

  it('gives every seeded correction a globally unique id', async () => {
    const repo = new FakeRepository();
    const newId = idFactory();
    await seedDemoHistory(repo, NOW, LEARNER_A, newId);
    await seedDemoHistory(repo, NOW, LEARNER_B, newId);
    const ids = [...repo.snapshots.values()].flatMap((s) => s.corrections.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
