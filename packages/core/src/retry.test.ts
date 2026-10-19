import { describe, expect, it } from 'vitest';
import { retry } from './retry.js';

function failing(times: number) {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    if (calls <= times) throw new Error(`fail ${calls}`);
    return 'ok';
  };
  return { fn, calls: () => calls };
}

describe('retry', () => {
  it('returns once a later attempt succeeds', async () => {
    const op = failing(2);
    expect(await retry(op.fn, { retries: 2, delayMs: 1 })).toBe('ok');
    expect(op.calls()).toBe(3);
  });

  it('rethrows the last error after the retries run out', async () => {
    const op = failing(5);
    await expect(retry(op.fn, { retries: 1, delayMs: 1 })).rejects.toThrow('fail 2');
  });

  it('stops at the first error that is not retryable', async () => {
    const op = failing(5);
    await expect(
      retry(op.fn, { retries: 3, delayMs: 1, shouldRetry: () => false }),
    ).rejects.toThrow('fail 1');
    expect(op.calls()).toBe(1);
  });
});
