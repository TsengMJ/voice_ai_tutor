import type { RedisOptions } from 'ioredis';

/** Shared by the API and the agent so both processes fail the same way when Redis stalls. */
export const REDIS_CLIENT_OPTIONS = {
  connectTimeout: 10_000,
  /** Every command is a single-key read or write; 3 s means Redis is unhealthy. */
  commandTimeout: 3_000,
  /** Resends a command queued while the connection was down; a timed-out command is not resent. */
  maxRetriesPerRequest: 3,
} as const satisfies RedisOptions;

const COMMAND_TIMEOUT_MESSAGE = 'Command timed out';

/** The command may already have run on the server, so repeating a non-idempotent write is unsafe. */
export function isRedisCommandTimeout(err: unknown): boolean {
  return err instanceof Error && err.message === COMMAND_TIMEOUT_MESSAGE;
}
