import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createRequest,
  createTestApp,
  loginAs,
  OPERATOR,
  resetData,
  waitFor,
} from './utils';

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 2);

describe('Processing (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let operator: string;

  const statusOf = async (id: string) =>
    (await prisma.serviceRequest.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    operator = await loginAs(app, OPERATOR);
  });

  beforeEach(async () => {
    await resetData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('takes a request through every stage to COMPLETED', async () => {
    const created = await createRequest(app, operator);

    const done = await waitFor(async () => {
      const row = await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.id },
      });
      return row.status === 'COMPLETED' && row;
    });

    expect(done).toMatchObject({
      progress: 100,
      stage: null,
      attempts: 1,
      queueJobId: null,
      failureReason: null,
    });
    expect(done.startedAt).not.toBeNull();
    expect(done.finishedAt!.getTime()).toBeGreaterThan(
      done.startedAt!.getTime(),
    );

    const history = await prisma.requestStatusHistory.findMany({
      where: { requestId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(
      history.map((h) => [h.fromStatus, h.toStatus, h.changedById]),
    ).toEqual([
      [null, 'QUEUED', created.createdBy.id],
      ['QUEUED', 'IN_PROGRESS', null],
      ['IN_PROGRESS', 'COMPLETED', null],
    ]);
  });

  it('runs jobs in parallel without exceeding the worker concurrency', async () => {
    const created = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        createRequest(app, operator, { title: `Parallel request ${i}` }),
      ),
    );
    const ids = created.map((r) => r.id);

    // Sample the database while the queue drains and record the most requests in progress at once.
    let maxInProgress = 0;
    await waitFor(
      async () => {
        const counts = await prisma.serviceRequest.groupBy({
          by: ['status'],
          where: { id: { in: ids } },
          _count: { _all: true },
        });
        const count = (status: string) =>
          counts.find((c) => c.status === status)?._count._all ?? 0;
        maxInProgress = Math.max(maxInProgress, count('IN_PROGRESS'));
        return count('COMPLETED') === ids.length;
      },
      { timeout: 20_000, interval: 30 },
    );

    expect(maxInProgress).toBe(CONCURRENCY);
  });

  it('keeps answering API calls while jobs run', async () => {
    await Promise.all(
      Array.from({ length: 4 }, () => createRequest(app, operator)),
    );
    await waitFor(
      async () =>
        (await prisma.serviceRequest.count({
          where: { status: 'IN_PROGRESS' },
        })) > 0,
    );

    for (const path of ['/api/v1/health', '/api/v1/requests']) {
      const started = performance.now();
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${operator}`)
        .expect(200);
      expect(performance.now() - started).toBeLessThan(200);
    }
  });

  it('stops a request cancelled while in progress', async () => {
    const created = await createRequest(app, operator);
    const running = await waitFor(async () => {
      const row = await prisma.serviceRequest.findUniqueOrThrow({
        where: { id: created.id },
      });
      return row.status === 'IN_PROGRESS' && row.progress > 0 && row;
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/requests/${created.id}/status`)
      .set('Authorization', `Bearer ${operator}`)
      .send({ status: 'CANCELLED', version: running.version })
      .expect(200);
    const cancelled = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: created.id },
    });

    // Longer than the whole job would take: the worker must have stopped at its next tick.
    await new Promise((resolve) => setTimeout(resolve, 800));
    const after = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(after.status).toBe('CANCELLED');
    expect(after.progress).toBe(cancelled.progress);
    expect(await statusOf(created.id)).toBe('CANCELLED');
  });
});
