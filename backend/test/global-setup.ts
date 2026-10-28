import './load-test-env';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { execSync } from 'node:child_process';
import { redisConnectionFromUrl } from '../src/config/redis-connection';
import { REQUEST_QUEUE } from '../src/processing/processing.constants';
import { seedUsers } from '../src/prisma/seed-data';

/**
 * Runs once before all e2e files: migrates the test database, empties it, seeds the demo users
 * and clears the test Redis database.
 */
export default async function globalSetup(): Promise<void> {
  const { DATABASE_URL, REDIS_URL } = process.env;
  // Never run destructive setup against anything but a test database.
  if (!DATABASE_URL || !new URL(DATABASE_URL).pathname.endsWith('_test')) {
    throw new Error(
      `Refusing to reset ${DATABASE_URL}: e2e tests need a *_test database`,
    );
  }

  execSync('npx prisma migrate deploy', { env: process.env, stdio: 'pipe' });

  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE request_status_history, service_requests, users RESTART IDENTITY CASCADE',
    );
    await seedUsers(prisma);
  } finally {
    await prisma.$disconnect();
  }

  const queue = new Queue(REQUEST_QUEUE, {
    connection: redisConnectionFromUrl(REDIS_URL!),
  });
  try {
    // Also clears the cached statistics kept in the same Redis database.
    const client = (await queue.client) as { flushdb(): Promise<unknown> };
    await client.flushdb();
  } finally {
    await queue.close();
  }
}
