import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisconnectGrace } from './disconnectGrace.js';

describe('DisconnectGrace', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mutes immediately and expires when the learner does not return', () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const grace = new DisconnectGrace({
      graceMs: 30_000,
      onMute: () => events.push('mute'),
      onRestore: () => events.push('restore'),
      onRejoin: () => events.push('rejoin'),
      onExpire: () => events.push('expire'),
    });
    grace.learnerLeft('CONNECTION_TIMEOUT');
    expect(events).toEqual(['mute']);
    vi.advanceTimersByTime(30_000);
    expect(events).toEqual(['mute', 'expire']);
  });

  it('does nothing when the learner leaves on purpose', () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const grace = new DisconnectGrace({
      graceMs: 30_000,
      onMute: () => events.push('mute'),
      onRestore: () => events.push('restore'),
      onRejoin: () => events.push('rejoin'),
      onExpire: () => events.push('expire'),
    });
    grace.learnerLeft('CLIENT_INITIATED');
    grace.learnerLeft('ROOM_DELETED');
    vi.advanceTimersByTime(30_000);
    expect(events).toEqual([]);
  });

  it('restores the session when the learner returns before the grace ends', () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const grace = new DisconnectGrace({
      graceMs: 30_000,
      onMute: () => events.push('mute'),
      onRestore: () => events.push('restore'),
      onRejoin: () => events.push('rejoin'),
      onExpire: () => events.push('expire'),
    });
    grace.learnerLeft('CONNECTION_TIMEOUT');
    grace.learnerReturned();
    vi.advanceTimersByTime(30_000);
    expect(events).toEqual(['mute', 'restore', 'rejoin']);
  });
});
