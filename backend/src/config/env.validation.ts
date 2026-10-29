import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  JWT_SECRET: Joi.string().min(32).required(),
  ACCESS_TOKEN_TTL_SECONDS: Joi.number().integer().min(10).default(900),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(7),
  SESSION_MAX_AGE_DAYS: Joi.number()
    .integer()
    .min(Joi.ref('REFRESH_TOKEN_TTL_DAYS'))
    .default(30),
  REFRESH_REUSE_GRACE_SECONDS: Joi.number().integer().min(0).default(30),
  CORS_ORIGIN: Joi.string().required(),
  WORKER_CONCURRENCY: Joi.number().integer().min(1).max(32).default(4),
  JOB_STAGE_MIN_MS: Joi.number().integer().min(0).default(2000),
  JOB_STAGE_MAX_MS: Joi.number()
    .integer()
    .min(Joi.ref('JOB_STAGE_MIN_MS'))
    .default(5000),
  JOB_FAILURE_RATE: Joi.number().min(0).max(1).default(0.1),
  STATS_CACHE_TTL_SECONDS: Joi.number().integer().min(1).default(15),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  SEED_ON_START: Joi.boolean().default(false),
});
