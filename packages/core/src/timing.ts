import { LIMITS } from './domain.js';

/**
 * Practice time credited for a text message. Messages inside the same burst count
 * the gap since the previous message; a message that starts a new burst counts a
 * flat amount, so a learner who walks away is not credited for the idle time.
 */
export function textActivityIncrementMs(lastTextAt: number | null, now: number): number {
  if (lastTextAt === null) return LIMITS.textBurstStartMs;
  const gap = now - lastTextAt;
  if (gap < 0) return 0;
  return gap <= LIMITS.textGapCapMs ? gap : LIMITS.textBurstStartMs;
}

export function remainingSessionMs(startedAt: number, now: number): number {
  return Math.max(0, startedAt + LIMITS.maxSessionMs - now);
}

export function isStale(lastActiveAt: number, now: number): boolean {
  return now - lastActiveAt > LIMITS.staleSessionMs;
}
