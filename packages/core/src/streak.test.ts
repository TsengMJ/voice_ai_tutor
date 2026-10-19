import { describe, expect, it } from 'vitest';
import { computeStreak, dayInTimeZone, isValidTimeZone, shiftDay } from './streak.js';

describe('shiftDay', () => {
  it('crosses month boundaries', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-10-17', '2026-10-18', '2026-10-19'], '2026-10-19')).toBe(3);
  });

  it('keeps a streak alive when the last practice was yesterday', () => {
    expect(computeStreak(['2026-10-17', '2026-10-18'], '2026-10-19')).toBe(2);
  });

  it('resets after a missed day', () => {
    expect(computeStreak(['2026-10-15', '2026-10-16'], '2026-10-19')).toBe(0);
  });

  it('stops at the first gap', () => {
    expect(computeStreak(['2026-10-14', '2026-10-18', '2026-10-19'], '2026-10-19')).toBe(2);
  });
});

describe('dayInTimeZone', () => {
  it('uses the learner time zone, not UTC', () => {
    const lateEveningUtc = Date.UTC(2026, 9, 19, 20, 0);
    expect(dayInTimeZone(lateEveningUtc, 'Asia/Taipei')).toBe('2026-10-20');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
  });

  it('rejects garbage', () => {
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});
