export interface RoomCredentials {
  serverUrl: string;
  token: string;
}

export interface RejoinOptions {
  deadline: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  signal?: { aborted: boolean };
  retryDelayMs?: number;
}

/**
 * Joins the room the learner was already in. Does not ask the API for a new room,
 * which would dispatch a second agent.
 */
export async function rejoinSameRoom(
  connect: (credentials: RoomCredentials) => Promise<void>,
  credentials: RoomCredentials,
  options: RejoinOptions,
): Promise<boolean> {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const delay = options.retryDelayMs ?? 1_000;
  while (!options.signal?.aborted && now() < options.deadline) {
    try {
      await connect(credentials);
      return !options.signal?.aborted;
    } catch {
      if (options.signal?.aborted || now() >= options.deadline) return false;
      await sleep(delay);
    }
  }
  return false;
}
