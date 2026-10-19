import { randomUUID } from 'node:crypto';
import { RedisSessionStore, SCENARIOS } from '@tutor/core';
import { Redis } from 'ioredis';
import pg from 'pg';
import { pino } from 'pino';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { PgStatsRepository } from './db/repository.js';
import { Flusher } from './flusher.js';
import { seedDemoHistory } from './seed/demo.js';
import { GeminiAnalyst } from './services/analyst.js';
import { LiveKitCloudGateway } from './services/livekit.js';
import { RedisRateLimiter } from './services/rateLimiter.js';
import { SessionService } from './services/sessionService.js';

const logger = pino({ name: 'api', redact: ['req.headers.cookie', 'token'] });

async function main() {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3 });

  const applied = await migrate(pool, config.MIGRATIONS_DIR);
  if (applied.length > 0) logger.info({ applied }, 'database migrations applied');

  const repo = new PgStatsRepository(pool);
  await repo.upsertScenarios(SCENARIOS);

  const store = new RedisSessionStore(redis);
  const sessions = new SessionService({
    store,
    repo,
    livekit: new LiveKitCloudGateway({
      url: config.LIVEKIT_URL,
      apiKey: config.LIVEKIT_API_KEY,
      apiSecret: config.LIVEKIT_API_SECRET,
      agentName: config.AGENT_NAME,
    }),
    analyst: new GeminiAnalyst(config.GOOGLE_API_KEY, config.GEMINI_TEXT_MODEL),
    logger,
    now: Date.now,
    newId: randomUUID,
  });

  const app = createApp({
    sessions,
    repo,
    limiter: new RedisRateLimiter(redis),
    logger,
    now: Date.now,
    cookieSecret: config.COOKIE_SECRET,
    cookieSecure: config.COOKIE_SECURE,
    corsOrigin: config.CORS_ORIGIN,
    seedSampleHistory: config.SEED_DEMO
      ? async (learnerId) => {
          await seedDemoHistory(repo, Date.now(), learnerId, randomUUID);
        }
      : undefined,
    health: async () => ({
      redis: await redis.ping().then(
        () => true,
        () => false,
      ),
      postgres: await repo.ping().then(
        () => true,
        () => false,
      ),
    }),
  });

  const flusher = new Flusher(store, sessions, logger);
  flusher.start(config.FLUSH_INTERVAL_MS);

  const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'api listening'));

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    flusher.stop();
    server.close();
    await flusher.tick();
    await Promise.allSettled([redis.quit(), pool.end()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'api failed to start');
  process.exit(1);
});
