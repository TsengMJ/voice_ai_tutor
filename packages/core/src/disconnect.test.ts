import { describe, expect, it } from 'vitest';
import { DISCONNECT_GRACE_MS, waitsForReconnect } from './domain.js';

describe('waitsForReconnect', () => {
  it('keeps the room for a dropped connection', () => {
    expect(DISCONNECT_GRACE_MS).toBe(30_000);
    expect(waitsForReconnect('CONNECTION_TIMEOUT')).toBe(true);
    expect(waitsForReconnect('SIGNAL_CLOSE')).toBe(true);
    expect(waitsForReconnect(undefined)).toBe(true);
  });

  it('leaves immediately when the learner or the room is gone on purpose', () => {
    expect(waitsForReconnect('CLIENT_INITIATED')).toBe(false);
    expect(waitsForReconnect('ROOM_DELETED')).toBe(false);
    expect(waitsForReconnect('USER_REJECTED')).toBe(false);
  });
});
