import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { InMemoryLocks, LockBusyError, RedisLocks, withLock } from './locks.js';

const redisUrl = process.env.REDIS_URL;

describe('withLock', () => {
  it('rejects a second holder without waiting', async () => {
    const locks = new InMemoryLocks();
    await locks.acquire('k', 1_000);
    await expect(withLock(locks, 'k', { ttlMs: 1_000 }, async () => 1)).rejects.toBeInstanceOf(
      LockBusyError,
    );
  });

  it('waits for the holder to release', async () => {
    const locks = new InMemoryLocks();
    const release = await locks.acquire('k', 1_000);
    setTimeout(() => void release?.(), 50);
    expect(await withLock(locks, 'k', { ttlMs: 1_000, waitMs: 1_000 }, async () => 'ran')).toBe(
      'ran',
    );
  });

  it('releases the lock when the callback throws', async () => {
    const locks = new InMemoryLocks();
    await expect(
      withLock(locks, 'k', { ttlMs: 1_000 }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await locks.acquire('k', 1_000)).not.toBeNull();
  });
});

describe.skipIf(!redisUrl)('RedisLocks (requires REDIS_URL)', () => {
  const redis = new Redis(redisUrl ?? '', { lazyConnect: true });
  const locks = new RedisLocks(redis);

  afterAll(async () => {
    await redis.quit();
  });

  it('allows one holder until released', async () => {
    const key = `test:${randomUUID()}`;
    const release = await locks.acquire(key, 5_000);
    expect(release).not.toBeNull();
    expect(await locks.acquire(key, 5_000)).toBeNull();
    await release?.();
    expect(await locks.acquire(key, 5_000)).not.toBeNull();
  });

  it('does not release a lock that expired and was taken by someone else', async () => {
    const key = `test:${randomUUID()}`;
    const stale = await locks.acquire(key, 50);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await locks.acquire(key, 5_000)).not.toBeNull();
    await stale?.();
    expect(await locks.acquire(key, 5_000)).toBeNull();
  });
});
