import { fileURLToPath } from 'node:url';
import { ServerOptions, cli, defineAgent, type JobContext } from '@livekit/agents';
import { RedisSessionStore } from '@tutor/core';
import { Redis } from 'ioredis';
import { loadConfig } from './config.js';
import { runTutorSession } from './tutorSession.js';

const config = loadConfig();

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const redis = new Redis(config.REDIS_URL);
    ctx.addShutdownCallback(async () => {
      await redis.quit();
    });
    await ctx.connect();
    await runTutorSession(ctx, new RedisSessionStore(redis), config);
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: config.AGENT_NAME,
  }),
);
