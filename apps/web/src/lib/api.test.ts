import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, request } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('retries a network failure', async () => {
    const fetchMock = stubFetch(new TypeError('Failed to fetch'), json(200, { ok: true }));
    expect(await request('/me')).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 503', async () => {
    const fetchMock = stubFetch(json(503, {}), json(200, { ok: true }));
    expect(await request('/me')).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a client error', async () => {
    const fetchMock = stubFetch(
      json(400, { error: { code: 'invalid_request', message: 'Bad input' } }),
    );
    await expect(request('/me')).rejects.toMatchObject({ status: 400, message: 'Bad input' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an unreachable server as status 0 after the retries', async () => {
    stubFetch(new TypeError('a'), new TypeError('b'), new TypeError('c'));
    const err = await request('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'network' });
  });
});

describe('api.createSession', () => {
  it('is sent once even when the server is unavailable', async () => {
    const fetchMock = stubFetch(json(503, {}));
    await expect(
      api.createSession({ scenarioId: 'coffee-order', language: 'en', mode: 'voice' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
