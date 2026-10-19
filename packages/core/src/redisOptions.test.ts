import { describe, expect, it } from 'vitest';
import { REDIS_CLIENT_OPTIONS, isRedisCommandTimeout } from './redisOptions.js';

describe('REDIS_CLIENT_OPTIONS', () => {
  it('bounds connection and command time, and resends only while reconnecting', () => {
    expect(REDIS_CLIENT_OPTIONS).toEqual({
      connectTimeout: 10_000,
      commandTimeout: 3_000,
      maxRetriesPerRequest: 3,
    });
  });
});

describe('isRedisCommandTimeout', () => {
  it('matches the error ioredis throws when a command exceeds commandTimeout', () => {
    expect(isRedisCommandTimeout(new Error('Command timed out'))).toBe(true);
  });

  it('does not match a connection failure, which is safe to retry', () => {
    expect(isRedisCommandTimeout(new Error('Connection is closed.'))).toBe(false);
    expect(isRedisCommandTimeout('Command timed out')).toBe(false);
  });
});
