import { describe, expect, it } from 'vitest';
import { decodeTutorEvent, encodeTutorEvent } from './protocol.js';

describe('tutor event encoding', () => {
  it('round-trips a valid event', () => {
    const event = { type: 'goals' as const, completed: ['greet'] };
    expect(decodeTutorEvent(encodeTutorEvent(event))).toEqual(event);
  });

  it('returns null for malformed payloads', () => {
    expect(decodeTutorEvent(new TextEncoder().encode('{nope'))).toBeNull();
  });

  it('returns null for unknown event types', () => {
    expect(decodeTutorEvent(new TextEncoder().encode('{"type":"bogus"}'))).toBeNull();
  });
});
