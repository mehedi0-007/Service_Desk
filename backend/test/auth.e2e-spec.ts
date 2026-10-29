import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  createTestApp,
  loginAs,
  OPERATOR,
  PASSWORD,
  SUPERVISOR,
} from './utils';

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in and returns a token with the user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: SUPERVISOR, password: PASSWORD })
      .expect(200);

    expect(res.body).toMatchObject({
      accessToken: expect.any(String) as unknown,
      user: { email: SUPERVISOR, role: 'SUPERVISOR' },
    });
    expect(res.body).not.toHaveProperty('user.passwordHash');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set(
        'Authorization',
        `Bearer ${(res.body as { accessToken: string }).accessToken}`,
      )
      .expect(200);
    expect(me.body).toMatchObject({ email: SUPERVISOR });
  });

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: OPERATOR, password: 'WrongPassword1!' })
      .expect(401);

    expect(res.body).toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      path: '/api/v1/auth/login',
      requestId: expect.any(String) as unknown,
    });
  });

  it('requires a token on protected routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/requests')
      .expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });

    await request(app.getHttpServer())
      .get('/api/v1/requests')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('forbids operators from supervisor-only routes', async () => {
    const token = await loginAs(app, OPERATOR);

    for (const path of ['/api/v1/users', '/api/v1/requests/stats']) {
      const res = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('declares every security scheme its API documentation refers to', async () => {
    const res = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const spec = res.body as {
      paths: Record<string, Record<string, { security?: object[] }>>;
      components: { securitySchemes?: Record<string, unknown> };
    };

    const used = new Set(
      Object.values(spec.paths)
        .flatMap((operations) => Object.values(operations))
        .flatMap((operation) => operation.security ?? [])
        .flatMap((requirement) => Object.keys(requirement)),
    );
    expect([...used].sort()).toEqual(
      Object.keys(spec.components.securitySchemes ?? {}).sort(),
    );
  });
});
