import { describe, expect, it } from 'vitest';
import { LIMITS } from './domain.js';
import { isStale, remainingSessionMs, textActivityIncrementMs } from './timing.js';

describe('textActivityIncrementMs', () => {
  it('credits a flat burst-start amount for the first message', () => {
    expect(textActivityIncrementMs(null, 1_000)).toBe(LIMITS.textBurstStartMs);
  });

  it('credits the gap for messages within the same burst', () => {
    expect(textActivityIncrementMs(10_000, 40_000)).toBe(30_000);
  });

  it('starts a new burst when the gap exceeds the cap', () => {
    expect(textActivityIncrementMs(0, LIMITS.textGapCapMs + 1)).toBe(LIMITS.textBurstStartMs);
  });

  it('never credits negative time when clocks disagree', () => {
    expect(textActivityIncrementMs(5_000, 1_000)).toBe(0);
  });
});

describe('remainingSessionMs', () => {
  it('counts down from the session cap', () => {
    expect(remainingSessionMs(0, 60_000)).toBe(LIMITS.maxSessionMs - 60_000);
  });

  it('bottoms out at zero', () => {
    expect(remainingSessionMs(0, LIMITS.maxSessionMs * 2)).toBe(0);
  });
});

describe('isStale', () => {
  it('flags sessions idle longer than the stale window', () => {
    expect(isStale(0, LIMITS.staleSessionMs + 1)).toBe(true);
  });

  it('keeps recently active sessions', () => {
    expect(isStale(0, 1_000)).toBe(false);
  });
});
