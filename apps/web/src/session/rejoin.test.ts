import { describe, expect, it } from 'vitest';
import { rejoinSameRoom, type RoomCredentials } from './rejoin.js';

const credentials: RoomCredentials = { serverUrl: 'wss://live.example', token: 'same-token' };

describe('rejoinSameRoom', () => {
  it('retries the saved token and does not ask for a new room', async () => {
    let now = 0;
    const used: string[] = [];
    const joined = await rejoinSameRoom(
      async (creds) => {
        used.push(creds.token);
        if (used.length < 2) throw new Error('room unreachable');
      },
      credentials,
      {
        deadline: 5_000,
        now: () => now,
        sleep: async (ms) => {
          now += ms;
        },
        retryDelayMs: 1_000,
      },
    );
    expect(joined).toBe(true);
    expect(used).toEqual(['same-token', 'same-token']);
  });

  it('stops when the grace window ends', async () => {
    let now = 0;
    let attempts = 0;
    const joined = await rejoinSameRoom(
      async () => {
        attempts += 1;
        throw new Error('room deleted');
      },
      credentials,
      {
        deadline: 2_500,
        now: () => now,
        sleep: async (ms) => {
          now += ms;
        },
        retryDelayMs: 1_000,
      },
    );
    expect(joined).toBe(false);
    expect(attempts).toBe(3);
    expect(now).toBeGreaterThanOrEqual(2_500);
  });
});
