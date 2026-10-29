import { ConfigType, registerAs } from '@nestjs/config';

// Values are already validated and defaulted by envValidationSchema.
export const appConfig = registerAs('app', () => {
  const env = process.env;
  return {
    nodeEnv: env.NODE_ENV as 'development' | 'production' | 'test',
    port: Number(env.PORT),
    corsOrigins: (env.CORS_ORIGIN ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    databaseUrl: env.DATABASE_URL as string,
    redisUrl: env.REDIS_URL as string,
    jwt: {
      secret: env.JWT_SECRET as string,
      accessTokenTtlSeconds: Number(env.ACCESS_TOKEN_TTL_SECONDS),
    },
    session: {
      refreshTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS),
      maxAgeDays: Number(env.SESSION_MAX_AGE_DAYS),
      reuseGraceSeconds: Number(env.REFRESH_REUSE_GRACE_SECONDS),
    },
    worker: {
      concurrency: Number(env.WORKER_CONCURRENCY),
      stageMinMs: Number(env.JOB_STAGE_MIN_MS),
      stageMaxMs: Number(env.JOB_STAGE_MAX_MS),
      failureRate: Number(env.JOB_FAILURE_RATE),
    },
    statsCacheTtlSeconds: Number(env.STATS_CACHE_TTL_SECONDS),
    logLevel: env.LOG_LEVEL as string,
    // Joi accepts "true" in any letter case, so compare the same way.
    seedOnStart: env.SEED_ON_START?.toLowerCase() === 'true',
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
