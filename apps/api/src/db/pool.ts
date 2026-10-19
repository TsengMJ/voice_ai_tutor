/** Client-side bounds for the shared Postgres pool. Queries themselves are not retried. */
export const POSTGRES_POOL_OPTIONS = {
  max: 10,
  /** Server cancels a statement that runs longer than this. */
  statement_timeout: 15_000,
  /** Client gives up when the server never answers, including a dead connection. */
  query_timeout: 15_000,
  /** How long to wait for a new connection before failing the request. */
  connectionTimeoutMillis: 5_000,
} as const;
