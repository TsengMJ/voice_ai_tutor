import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Redis } from 'ioredis';

export type ReleaseLock = () => Promise<void>;

export interface Locks {
  /** Returns a release function, or null while another holder has the key. Expires after `ttlMs`. */
  acquire(key: string, ttlMs: number): Promise<ReleaseLock | null>;
}

export class LockBusyError extends Error {
  constructor(readonly key: string) {
    super(`Lock is held by another worker: ${key}`);
  }
}

const RETRY_MS = 100;
const RELEASE_IF_OWNER =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0";

export class RedisLocks implements Locks {
  constructor(private readonly redis: Redis) {}

  async acquire(key: string, ttlMs: number) {
    const redisKey = `lock:${key}`;
    const token = randomUUID();
    const ok = await this.redis.set(redisKey, token, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') return null;
    return async () => {
      await this.redis.eval(RELEASE_IF_OWNER, 1, redisKey, token);
    };
  }
}

export class InMemoryLocks implements Locks {
  private readonly expiresAt = new Map<string, number>();

  async acquire(key: string, ttlMs: number) {
    if ((this.expiresAt.get(key) ?? 0) > Date.now()) return null;
    const until = Date.now() + ttlMs;
    this.expiresAt.set(key, until);
    return async () => {
      if (this.expiresAt.get(key) === until) this.expiresAt.delete(key);
    };
  }
}

/** Runs `fn` while holding `key`, retrying for up to `waitMs`. Throws LockBusyError if it never frees up. */
export async function withLock<T>(
  locks: Locks,
  key: string,
  { ttlMs, waitMs = 0 }: { ttlMs: number; waitMs?: number },
  fn: () => Promise<T>,
): Promise<T> {
  const deadline = Date.now() + waitMs;
  let release = await locks.acquire(key, ttlMs);
  while (!release && Date.now() < deadline) {
    await sleep(RETRY_MS);
    release = await locks.acquire(key, ttlMs);
  }
  if (!release) throw new LockBusyError(key);
  try {
    return await fn();
  } finally {
    // A failed release is not fatal: the key expires after ttlMs.
    await release().catch(() => undefined);
  }
}
