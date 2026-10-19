import type { Redis } from 'ioredis';

export interface RateLimiter {
  /** Records a hit and returns false once the key exceeds `limit` within the window. */
  hit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowSeconds: number) {
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const redisKey = `ratelimit:${key}:${bucket}`;
    const [[, count]] = (await this.redis
      .multi()
      .incr(redisKey)
      .expire(redisKey, windowSeconds)
      .exec()) as [[Error | null, number]];
    return count <= limit;
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  async hit(key: string, limit: number) {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return count <= limit;
  }
}
