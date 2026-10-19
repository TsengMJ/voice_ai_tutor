export interface RetryOptions {
  /** Extra attempts after the first one. */
  retries: number;
  delayMs: number;
  /** Defaults to retrying every error. */
  shouldRetry?: (err: unknown) => boolean;
}

/** Runs `fn`, retrying failures with a fixed delay, and rethrows the last error. */
export async function retry<T>(
  fn: () => Promise<T>,
  { retries, delayMs, shouldRetry = () => true }: RetryOptions,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
