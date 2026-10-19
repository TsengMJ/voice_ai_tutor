import type {
  Catalog,
  ConnectionDetails,
  CreateSessionRequest,
  DashboardData,
  Hint,
  Me,
  Mode,
  SessionReview,
  SessionView,
} from '@tutor/core/browser';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
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

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const api = {
  catalog: () => request<Catalog>('/scenarios'),
  me: () => request<Me>('/me'),
  dashboard: () => request<DashboardData>(`/dashboard?tz=${encodeURIComponent(timeZone)}`),
  createSession: (input: CreateSessionRequest) =>
    post<SessionView>('/sessions', { ...input, timezone: timeZone }),
  session: (id: string) => request<SessionReview>(`/sessions/${id}`),
  connect: (id: string, mode: Mode) =>
    post<ConnectionDetails>(`/sessions/${id}/connection`, { mode }),
  hint: (id: string) => post<Hint>(`/sessions/${id}/hint`),
  end: (id: string) => post<SessionReview>(`/sessions/${id}/end`),
};
