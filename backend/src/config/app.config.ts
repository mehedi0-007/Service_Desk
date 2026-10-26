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
      expiresIn: env.JWT_EXPIRES_IN as string,
    },
    worker: {
      concurrency: Number(env.WORKER_CONCURRENCY),
      stageMinMs: Number(env.JOB_STAGE_MIN_MS),
      stageMaxMs: Number(env.JOB_STAGE_MAX_MS),
      failureRate: Number(env.JOB_FAILURE_RATE),
    },
    statsCacheTtlSeconds: Number(env.STATS_CACHE_TTL_SECONDS),
    logLevel: env.LOG_LEVEL as string,
    seedOnStart: env.SEED_ON_START === 'true',
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
