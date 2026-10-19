import {
  ConnectionRequestSchema,
  CreateSessionRequestSchema,
  DEMO_LEARNER_ID,
  LANGUAGES,
  SCENARIOS,
  dayInTimeZone,
  isValidTimeZone,
  type Catalog,
  type DashboardData,
  type Me,
} from '@tutor/core';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { z, ZodError } from 'zod';
import type { StatsRepository } from './db/repository.js';
import { AppError, notFound } from './errors.js';
import { learnerIdOf, learnerIdentity } from './http/learner.js';
import type { RateLimiter } from './services/rateLimiter.js';
import type { SessionService } from './services/sessionService.js';

export interface AppDeps {
  sessions: SessionService;
  repo: StatsRepository;
  limiter: RateLimiter;
  health: () => Promise<Record<string, boolean>>;
  logger: Logger;
  now: () => number;
  cookieSecret: string;
  cookieSecure: boolean;
  corsOrigin: string;
  seedDemo: boolean;
}

const SessionId = z.uuid();

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser(deps.cookieSecret));

  app.get('/api/health', async (_req, res) => {
    const checks = await deps.health();
    const ok = Object.values(checks).every(Boolean);
    res.status(ok ? 200 : 503).json({ ok, checks });
  });

  app.use(
    '/api',
    learnerIdentity({
      secure: deps.cookieSecure,
      defaultLearnerId: deps.seedDemo ? DEMO_LEARNER_ID : undefined,
    }),
  );

  const limit =
    (name: string, max: number, windowSeconds = 60): RequestHandler =>
    async (_req, res, next) => {
      const allowed = await deps.limiter.hit(`${name}:${learnerIdOf(res)}`, max, windowSeconds);
      if (!allowed)
        return next(new AppError(429, 'rate_limited', 'Too many requests. Slow down a little.'));
      next();
    };

  app.use('/api', limit('all', 300));

  const sessionIdParam = (raw: string | string[] | undefined) => {
    const parsed = SessionId.safeParse(raw);
    if (!parsed.success) throw notFound('Session');
    return parsed.data;
  };

  app.get('/api/scenarios', (_req, res) => {
    const catalog: Catalog = { scenarios: [...SCENARIOS], languages: [...LANGUAGES] };
    res.json(catalog);
  });

  app.get('/api/me', async (_req, res) => {
    const learnerId = learnerIdOf(res);
    const me: Me = {
      learnerId,
      isDemo: learnerId === DEMO_LEARNER_ID,
      activeSessionId: await deps.sessions.activeSessionId(learnerId),
    };
    res.json(me);
  });

  app.get('/api/dashboard', async (req, res) => {
    const learnerId = learnerIdOf(res);
    const tz =
      typeof req.query.tz === 'string' && isValidTimeZone(req.query.tz) ? req.query.tz : 'UTC';
    const [stats, activeSessionId] = await Promise.all([
      deps.repo.getDashboard(learnerId, dayInTimeZone(deps.now(), tz)),
      deps.sessions.activeSessionId(learnerId),
    ]);
    const data: DashboardData = {
      ...stats,
      isDemo: learnerId === DEMO_LEARNER_ID,
      activeSessionId,
    };
    res.json(data);
  });

  app.post('/api/sessions', limit('create', 10), async (req, res) => {
    const input = CreateSessionRequestSchema.parse(req.body);
    res.status(201).json(await deps.sessions.create(learnerIdOf(res), input));
  });

  app.get('/api/sessions/:id', async (req, res) => {
    res.json(await deps.sessions.review(learnerIdOf(res), sessionIdParam(req.params.id)));
  });

  app.post('/api/sessions/:id/connection', limit('connect', 20), async (req, res) => {
    const { mode } = ConnectionRequestSchema.parse(req.body);
    res.json(await deps.sessions.connect(learnerIdOf(res), sessionIdParam(req.params.id), mode));
  });

  app.post('/api/sessions/:id/hint', limit('hint', 10), async (req, res) => {
    res.json(await deps.sessions.hint(learnerIdOf(res), sessionIdParam(req.params.id)));
  });

  app.post('/api/sessions/:id/end', async (req, res) => {
    res.json(await deps.sessions.end(learnerIdOf(res), sessionIdParam(req.params.id)));
  });

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'not_found', 'Route not found')));

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: { code: 'invalid_request', message: z.prettifyError(err) } });
      return;
    }
    if (err instanceof AppError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
      res
        .status(400)
        .json({ error: { code: 'invalid_request', message: 'Malformed request body' } });
      return;
    }
    deps.logger.error({ err, path: req.path }, 'unhandled request error');
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
  };
  app.use(errorHandler);

  return app;
}
