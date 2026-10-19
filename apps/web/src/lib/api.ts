import {
  retry,
  type Catalog,
  type ConnectionDetails,
  type CreateSessionRequest,
  type DashboardData,
  type Hint,
  type Me,
  type Mode,
  type SessionReview,
  type SessionView,
} from '@tutor/core/browser';

export class ApiError extends Error {
  constructor(
    /** 0 when the request never got an HTTP response (offline or timed out). */
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface RequestPolicy {
  timeoutMs: number;
  retries: number;
}

/** Idempotent reads. */
export const READ: RequestPolicy = { timeoutMs: 10_000, retries: 2 };
/** Writes that are safe to repeat: end is idempotent, a repeated connect only opens an unused room. */
export const ACTION: RequestPolicy = { timeoutMs: 20_000, retries: 1 };
/** Writes that must not repeat: a retried create could start two sessions. */
export const ONCE: RequestPolicy = { timeoutMs: 10_000, retries: 0 };

const RETRY_DELAY_MS = 400;
const RETRYABLE_STATUS = new Set([0, 502, 503, 504]);

export const isRetryable = (err: unknown) =>
  err instanceof ApiError && RETRYABLE_STATUS.has(err.status);

async function send<T>(path: string, init: RequestInit | undefined, timeoutMs: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    throw new ApiError(
      0,
      timedOut ? 'timeout' : 'network',
      timedOut
        ? 'The server took too long to respond. Try again in a moment.'
        : "Can't reach the server. Check your connection and try again.",
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'http_error',
      body?.error?.message ?? `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

export function request<T>(path: string, init?: RequestInit, policy: RequestPolicy = READ) {
  return retry(() => send<T>(path, init, policy.timeoutMs), {
    retries: policy.retries,
    delayMs: RETRY_DELAY_MS,
    shouldRetry: isRetryable,
  });
}

const post = <T>(path: string, body: unknown, policy: RequestPolicy) =>
  request<T>(
    path,
    { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) },
    policy,
  );

export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const api = {
  catalog: () => request<Catalog>('/scenarios'),
  me: () => request<Me>('/me'),
  dashboard: () => request<DashboardData>(`/dashboard?tz=${encodeURIComponent(timeZone)}`),
  createSession: (input: CreateSessionRequest) =>
    post<SessionView>('/sessions', { ...input, timezone: timeZone }, ONCE),
  session: (id: string) => request<SessionReview>(`/sessions/${id}`),
  connect: (id: string, mode: Mode) =>
    post<ConnectionDetails>(`/sessions/${id}/connection`, { mode }, ACTION),
  hint: (id: string) => post<Hint>(`/sessions/${id}/hint`, undefined, ACTION),
  end: (id: string) => post<SessionReview>(`/sessions/${id}/end`, undefined, ACTION),
};

export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;
