import { describe, expect, it } from 'vitest';
import { POSTGRES_POOL_OPTIONS } from './pool.js';

describe('POSTGRES_POOL_OPTIONS', () => {
  it('times out a new connection and a query that never returns', () => {
    expect(POSTGRES_POOL_OPTIONS.connectionTimeoutMillis).toBe(5_000);
    expect(POSTGRES_POOL_OPTIONS.query_timeout).toBe(POSTGRES_POOL_OPTIONS.statement_timeout);
    expect(POSTGRES_POOL_OPTIONS.statement_timeout).toBe(15_000);
  });
});
