import { getQueueToken } from '@nestjs/bullmq';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { REQUEST_QUEUE } from '../src/processing/processing.constants';
import { RequestProcessor } from '../src/processing/request.processor';
import { PrismaService } from '../src/prisma/prisma.service';
import { RequestDto } from '../src/requests/dto/request.response';

export const PASSWORD = 'Password123!';
export const OPERATOR = 'operator1@demo.test';
export const OPERATOR_2 = 'operator2@demo.test';
export const SUPERVISOR = 'supervisor@demo.test';

/**
 * The real application with the same setup as main.ts, listening on a random port.
 * Without the worker, requests stay exactly where the API puts them.
 */
export async function createTestApp({
  worker = true,
} = {}): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (!worker) {
    builder.overrideProvider(RequestProcessor).useValue({});
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });
  configureApp(app);
  await app.listen(0);
  return app;
}

/** Removes all requests and queued jobs; the seeded users stay. */
export async function resetData(app: NestExpressApplication): Promise<void> {
  await queueOf(app).obliterate({ force: true });
  await app
    .get(PrismaService)
    .$executeRawUnsafe(
      'TRUNCATE TABLE request_status_history, service_requests',
    );
}

export const queueOf = (app: NestExpressApplication): Queue =>
  app.get<Queue>(getQueueToken(REQUEST_QUEUE), { strict: false });

export async function loginAs(
  app: NestExpressApplication,
  email: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

export async function createRequest(
  app: NestExpressApplication,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<RequestDto> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/requests')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Laptop does not boot',
      description: 'The laptop shows a black screen after the logo.',
      category: 'HARDWARE',
      ...overrides,
    })
    .expect(201);
  return res.body as RequestDto;
}

/** Polls until the condition returns a truthy value (test helper only). */
export async function waitFor<T>(
  condition: () => Promise<T | null | undefined | false>,
  { timeout = 10_000, interval = 50 } = {},
): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > deadline) {
      throw new Error(`Condition not met within ${timeout} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
