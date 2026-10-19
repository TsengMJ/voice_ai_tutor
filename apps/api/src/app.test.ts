import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { InMemoryRateLimiter } from './services/rateLimiter.js';
import { buildTestService } from './testing/fakes.js';

function buildApp({ seedDemo = false } = {}) {
  const { service, repo } = buildTestService();
  const seeded: string[] = [];
  const app = createApp({
    sessions: service,
    repo,
    limiter: new InMemoryRateLimiter(),
    health: async () => ({ redis: true, postgres: true }),
    logger: pino({ level: 'silent' }),
    now: () => 1_000_000,
    cookieSecret: 'test-secret-that-is-long-enough',
    cookieSecure: false,
    corsOrigin: 'http://localhost:3000',
    seedSampleHistory: seedDemo
      ? async (learnerId) => {
          seeded.push(learnerId);
          await repo.ensureLearner(learnerId, true);
        }
      : undefined,
  });
  return Object.assign(app, { seeded });
}

const newSession = { scenarioId: 'coffee-order', language: 'es', mode: 'voice', timezone: 'UTC' };

describe('API', () => {
  it('reports health without requiring a learner cookie', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('issues a signed, httpOnly learner cookie on first visit', async () => {
    const res = await request(buildApp()).get('/api/me');
    expect(res.headers['set-cookie']?.[0]).toMatch(/tutor_lid=s%3A.*HttpOnly.*SameSite=Lax/);
  });

  it('gives every first-time visitor their own learner id', async () => {
    const app = buildApp({ seedDemo: true });
    const first = await request(app).get('/api/me');
    const second = await request(app).get('/api/me');
    expect(first.body.learnerId).not.toBe(second.body.learnerId);
  });

  it('seeds sample history once for a new learner when demo seeding is on', async () => {
    const app = buildApp({ seedDemo: true });
    const visitor = request.agent(app);
    const me = await visitor.get('/api/me');
    await visitor.get('/api/me');
    expect(app.seeded).toEqual([me.body.learnerId]);
  });

  it('labels seeded learners as demo', async () => {
    const res = await request(buildApp({ seedDemo: true })).get('/api/me');
    expect(res.body.isDemo).toBe(true);
  });

  it('does not label learners as demo when seeding is off', async () => {
    const res = await request(buildApp()).get('/api/me');
    expect(res.body.isDemo).toBe(false);
  });

  it('serves the scenario catalog without issuing an identity', async () => {
    const res = await request(buildApp()).get('/api/scenarios');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rate limits new identities per client address', async () => {
    const app = buildApp({ seedDemo: true });
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await request(app).get('/api/me')).status);
    expect(statuses.at(-1)).toBe(429);
  });

  it('ignores a forged, unsigned learner cookie', async () => {
    const res = await request(buildApp())
      .get('/api/me')
      .set('Cookie', 'tutor_lid=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(res.body.learnerId).not.toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('runs the session lifecycle for the cookie owner', async () => {
    const agent = request.agent(buildApp());
    const created = await agent.post('/api/sessions').send(newSession);
    expect(created.status).toBe(201);

    const connection = await agent
      .post(`/api/sessions/${created.body.id}/connection`)
      .send({ mode: 'voice' });
    expect(connection.body).toMatchObject({ serverUrl: 'wss://example.livekit.cloud' });

    const ended = await agent.post(`/api/sessions/${created.body.id}/end`);
    expect(ended.body.session.status).toBe('ended');
  });

  it("returns 404 for another learner's session", async () => {
    const app = buildApp();
    const owner = request.agent(app);
    const created = await owner.post('/api/sessions').send(newSession);
    const res = await request(app).get(`/api/sessions/${created.body.id}`);
    expect(res.status).toBe(404);
  });

  it('validates request bodies', async () => {
    const res = await request(buildApp())
      .post('/api/sessions')
      .send({ scenarioId: 'coffee-order', language: 'xx' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
  });

  it('treats malformed session ids as not found', async () => {
    const res = await request(buildApp()).get('/api/sessions/not-a-uuid');
    expect(res.status).toBe(404);
  });

  it('rate limits session creation', async () => {
    const agent = request.agent(buildApp());
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push((await agent.post('/api/sessions').send(newSession)).status);
    expect(statuses.at(-1)).toBe(429);
  });
});
