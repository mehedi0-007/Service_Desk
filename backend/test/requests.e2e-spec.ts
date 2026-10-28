import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { RequestDto } from '../src/requests/dto/request.response';
import {
  createRequest,
  createTestApp,
  loginAs,
  OPERATOR,
  OPERATOR_2,
  queueOf,
  resetData,
  SUPERVISOR,
} from './utils';

type Page = { items: RequestDto[]; meta: { total: number } };
type ErrorBody = { code: string; details: { field: string }[] | null };

/** supertest types the body as any; name the shape the test expects. */
const bodyOf = <T>(res: { body: unknown }) => res.body as T;

describe('Requests (e2e)', () => {
  let app: NestExpressApplication;
  let operator: string;
  let operator2: string;
  let supervisor: string;

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    // Processing is covered in processing.e2e-spec; here requests stay where the API puts them.
    app = await createTestApp({ worker: false });
    [operator, operator2, supervisor] = await Promise.all([
      loginAs(app, OPERATOR),
      loginAs(app, OPERATOR_2),
      loginAs(app, SUPERVISOR),
    ]);
  });

  beforeEach(async () => {
    await resetData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a queued request with history and a job', async () => {
    const created = await createRequest(app, operator, { priority: 'HIGH' });

    expect(created).toMatchObject({
      status: 'QUEUED',
      priority: 'HIGH',
      progress: 0,
      version: 1,
      createdBy: { name: 'Olivia Operator' },
      assignedTo: null,
    });

    const history = await api()
      .get(`/api/v1/requests/${created.id}/history`)
      .set(as(operator))
      .expect(200);
    expect(history.body).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: 'QUEUED' }),
    ]);
    expect(await queueOf(app).getJob(`${created.id}-v1`)).toBeDefined();
  });

  it('returns field details for invalid input', async () => {
    const res = await api()
      .post('/api/v1/requests')
      .set(as(operator))
      .send({
        title: 'ab',
        description: 'short',
        category: 'PLUMBING',
        extra: 1,
      })
      .expect(400);

    expect(bodyOf<ErrorBody>(res).code).toBe('VALIDATION_ERROR');
    const fields = bodyOf<ErrorBody>(res).details!.map((d) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining(['title', 'description', 'category', 'extra']),
    );
  });

  it('does not let supervisors create requests', async () => {
    await api()
      .post('/api/v1/requests')
      .set(as(supervisor))
      .send({
        title: 'Supervisor request',
        description: 'Supervisors only monitor.',
        category: 'OTHER',
      })
      .expect(403);
  });

  it("keeps each operator's requests private", async () => {
    const mine = await createRequest(app, operator);
    await createRequest(app, operator2, { title: 'Another operator' });

    const list = await api()
      .get('/api/v1/requests')
      .set(as(operator))
      .expect(200);
    expect((list.body as Page).items.map((r) => r.id)).toEqual([mine.id]);

    await api()
      .get(`/api/v1/requests/${mine.id}`)
      .set(as(operator2))
      .expect(404);
    await api()
      .get(`/api/v1/requests/${mine.id}/history`)
      .set(as(operator2))
      .expect(404);

    const all = await api()
      .get('/api/v1/requests')
      .set(as(supervisor))
      .expect(200);
    expect((all.body as Page).meta.total).toBe(2);
  });

  it('filters by status, searches by reference and validates paging', async () => {
    const first = await createRequest(app, operator, { title: 'Printer jams' });
    const second = await createRequest(app, operator, { title: 'VPN drops' });
    await api()
      .patch(`/api/v1/requests/${second.id}/status`)
      .set(as(operator))
      .send({ status: 'CANCELLED', version: 1 })
      .expect(200);

    const queued = await api()
      .get('/api/v1/requests?status=QUEUED')
      .set(as(supervisor))
      .expect(200);
    expect((queued.body as Page).items.map((r) => r.id)).toEqual([first.id]);

    const both = await api()
      .get('/api/v1/requests?status=QUEUED,CANCELLED')
      .set(as(supervisor))
      .expect(200);
    expect((both.body as Page).meta.total).toBe(2);

    const ref = `SR-${String(second.referenceNo).padStart(5, '0')}`;
    const byRef = await api()
      .get(`/api/v1/requests?q=${ref}`)
      .set(as(supervisor))
      .expect(200);
    expect((byRef.body as Page).items.map((r) => r.id)).toEqual([second.id]);

    const byText = await api()
      .get('/api/v1/requests?q=printer')
      .set(as(supervisor))
      .expect(200);
    expect((byText.body as Page).items.map((r) => r.id)).toEqual([first.id]);

    await api()
      .get('/api/v1/requests?pageSize=101')
      .set(as(supervisor))
      .expect(400);
    await api()
      .get('/api/v1/requests?status=DONE')
      .set(as(supervisor))
      .expect(400);
  });

  it('cancels and retries with optimistic versions', async () => {
    const created = await createRequest(app, operator);

    const cancelled = await api()
      .patch(`/api/v1/requests/${created.id}/status`)
      .set(as(operator))
      .send({ status: 'CANCELLED', version: 1 })
      .expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', version: 2 });
    // The waiting job is removed with the cancel.
    expect(await queueOf(app).getJob(`${created.id}-v1`)).toBeUndefined();

    // Operators cannot retry; supervisors can.
    await api()
      .patch(`/api/v1/requests/${created.id}/status`)
      .set(as(operator))
      .send({ status: 'QUEUED', version: 2 })
      .expect(403);
    const retried = await api()
      .patch(`/api/v1/requests/${created.id}/status`)
      .set(as(supervisor))
      .send({ status: 'QUEUED', version: 2 })
      .expect(200);
    expect(retried.body).toMatchObject({ status: 'QUEUED', version: 3 });
    expect(await queueOf(app).getJob(`${created.id}-v3`)).toBeDefined();

    const history = await api()
      .get(`/api/v1/requests/${created.id}/history`)
      .set(as(supervisor))
      .expect(200);
    expect(
      (history.body as { toStatus: string }[]).map((h) => h.toStatus),
    ).toEqual(['QUEUED', 'CANCELLED', 'QUEUED']);
  });

  it('rejects a stale version with VERSION_CONFLICT', async () => {
    const created = await createRequest(app, operator);
    await api()
      .patch(`/api/v1/requests/${created.id}`)
      .set(as(supervisor))
      .send({ priority: 'URGENT', version: 1 })
      .expect(200);

    const res = await api()
      .patch(`/api/v1/requests/${created.id}/status`)
      .set(as(operator))
      .send({ status: 'CANCELLED', version: 1 })
      .expect(409);
    expect(bodyOf<ErrorBody>(res).code).toBe('VERSION_CONFLICT');
  });

  it('lets only one of two simultaneous edits win', async () => {
    const created = await createRequest(app, operator);

    const results = await Promise.all(
      (['HIGH', 'LOW'] as const).map((priority) =>
        api()
          .patch(`/api/v1/requests/${created.id}`)
          .set(as(supervisor))
          .send({ priority, version: 1 }),
      ),
    );

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const final = await api()
      .get(`/api/v1/requests/${created.id}`)
      .set(as(supervisor))
      .expect(200);
    expect(bodyOf<RequestDto>(final).version).toBe(2);
  });

  it('rejects cancelling a finished request with INVALID_TRANSITION', async () => {
    const created = await createRequest(app, operator);
    await app.get(PrismaService).serviceRequest.update({
      where: { id: created.id },
      data: { status: 'COMPLETED', progress: 100, finishedAt: new Date() },
    });

    const res = await api()
      .patch(`/api/v1/requests/${created.id}/status`)
      .set(as(operator))
      .send({ status: 'CANCELLED', version: 1 })
      .expect(409);
    expect(bodyOf<ErrorBody>(res).code).toBe('INVALID_TRANSITION');
  });

  it('only assigns supervisors', async () => {
    const created = await createRequest(app, operator);
    const users = await api()
      .get('/api/v1/users?role=SUPERVISOR')
      .set(as(supervisor))
      .expect(200);
    const sam = (users.body as { id: string; email: string }[]).find(
      (u) => u.email === SUPERVISOR,
    )!;

    const assigned = await api()
      .patch(`/api/v1/requests/${created.id}`)
      .set(as(supervisor))
      .send({ assignedToId: sam.id, version: 1 })
      .expect(200);
    expect(bodyOf<RequestDto>(assigned).assignedTo).toMatchObject({
      id: sam.id,
    });

    await api()
      .patch(`/api/v1/requests/${created.id}`)
      .set(as(supervisor))
      .send({ assignedToId: created.createdBy.id, version: 2 })
      .expect(400);
  });
});
