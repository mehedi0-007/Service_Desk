import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  clientIp,
  createTestApp,
  createUser,
  login,
  PASSWORD,
  REFRESH_COOKIE,
  refreshCookieOf,
} from './utils';

const ORIGIN = 'http://localhost:3000';

describe('Sessions (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ worker: false });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const me = (accessToken: string) =>
    http().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);

  const refresh = (cookie?: string) => {
    const req = http().post('/api/v1/auth/refresh').set('Origin', ORIGIN);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('sets the refresh token as an httpOnly cookie scoped to the auth routes', async () => {
    await createUser(app, 'cookie@demo.test');
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'cookie@demo.test', password: PASSWORD })
      .expect(200);

    expect(res.body).toMatchObject({
      accessToken: expect.any(String) as unknown,
      expiresIn: 3600,
      user: { email: 'cookie@demo.test' },
    });
    // The refresh token is never readable by scripts.
    expect(res.body).not.toHaveProperty('refreshToken');

    const cookie = (res.headers['set-cookie'] as unknown as string[]).find(
      (c) => c.startsWith(`${REFRESH_COOKIE}=`),
    )!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Expires=/);
  });

  it('rotates the refresh token and issues a working access token', async () => {
    await createUser(app, 'rotate@demo.test');
    const first = await login(app, 'rotate@demo.test');

    const res = await refresh(first.cookie).expect(200);
    const rotated = refreshCookieOf(res);
    const { accessToken } = res.body as { accessToken: string };

    expect(rotated).not.toBe(first.cookie);
    await me(accessToken).expect(200);
    // The first access token stays valid until it expires: same session.
    await me(first.accessToken).expect(200);
  });

  it('revokes the whole session when a rotated refresh token is used again', async () => {
    await createUser(app, 'reuse@demo.test');
    const first = await login(app, 'reuse@demo.test');
    const res = await refresh(first.cookie).expect(200);
    const rotated = refreshCookieOf(res);

    // Someone replays the old token (the grace period is 0 in tests).
    const replay = await refresh(first.cookie).expect(401);
    expect(replay.body).toMatchObject({ code: 'SESSION_EXPIRED' });

    // Both the legitimate holder and every access token of the session are cut off.
    await refresh(rotated).expect(401);
    await me(first.accessToken).expect(401);
    await me((res.body as { accessToken: string }).accessToken).expect(401);
  });

  it('rejects a refresh without a cookie', async () => {
    const res = await refresh().expect(401);
    expect(res.body).toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it('rejects cookie requests from origins outside the allow-list', async () => {
    await createUser(app, 'csrf@demo.test');
    const { cookie } = await login(app, 'csrf@demo.test');

    for (const path of ['/api/v1/auth/refresh', '/api/v1/auth/logout']) {
      const res = await http()
        .post(path)
        .set('Origin', 'https://evil.example')
        .set('Cookie', cookie)
        .expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    }
    // The forged requests changed nothing.
    await refresh(cookie).expect(200);
  });

  it('logs out on the server: the cookie is cleared and the access token stops working at once', async () => {
    await createUser(app, 'logout@demo.test');
    const { accessToken, cookie } = await login(app, 'logout@demo.test');
    await me(accessToken).expect(200);

    const res = await http()
      .post('/api/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(204);

    const cleared = (res.headers['set-cookie'] as unknown as string[]).find(
      (c) => c.startsWith(`${REFRESH_COOKIE}=`),
    )!;
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);

    await me(accessToken).expect(401);
    await refresh(cookie).expect(401);
    // Logging out twice is harmless.
    await http().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
  });

  it('logs out with the access token when the browser blocks the cookie', async () => {
    await createUser(app, 'nocookie@demo.test');
    const { accessToken, cookie } = await login(app, 'nocookie@demo.test');

    await http()
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await me(accessToken).expect(401);
    await refresh(cookie).expect(401);
  });

  it('signs out of every device', async () => {
    await createUser(app, 'everywhere@demo.test');
    const laptop = await login(app, 'everywhere@demo.test');
    const phone = await login(app, 'everywhere@demo.test');

    await http()
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${laptop.accessToken}`)
      .expect(204);

    for (const device of [laptop, phone]) {
      await me(device.accessToken).expect(401);
      await refresh(device.cookie).expect(401);
    }
  });

  describe('password change', () => {
    const change = (accessToken: string, body: Record<string, unknown>) =>
      http()
        .patch('/api/v1/auth/password')
        .set('X-Forwarded-For', clientIp())
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body);

    it('changes the password and signs out the other devices only', async () => {
      await createUser(app, 'password@demo.test');
      const current = await login(app, 'password@demo.test');
      const other = await login(app, 'password@demo.test');

      await change(current.accessToken, {
        currentPassword: PASSWORD,
        newPassword: 'NewSecret42',
      }).expect(204);

      await me(current.accessToken).expect(200);
      await refresh(current.cookie).expect(200);
      await me(other.accessToken).expect(401);
      await refresh(other.cookie).expect(401);

      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'password@demo.test', password: PASSWORD })
        .expect(401);
      await login(app, 'password@demo.test', 'NewSecret42');
    });

    it('reports a wrong current password on its field, without ending the session', async () => {
      await createUser(app, 'wrong-current@demo.test');
      const { accessToken } = await login(app, 'wrong-current@demo.test');

      const res = await change(accessToken, {
        currentPassword: 'NotMyPassword1',
        newPassword: 'NewSecret42',
      }).expect(400);

      expect(res.body).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [
          {
            field: 'currentPassword',
            messages: ['Current password is incorrect'],
          },
        ],
      });
      await me(accessToken).expect(200);
    });

    it('enforces the password policy', async () => {
      await createUser(app, 'policy@demo.test');
      const { accessToken } = await login(app, 'policy@demo.test');

      for (const newPassword of ['short1', 'onlyletters', '1234567890']) {
        const res = await change(accessToken, {
          currentPassword: PASSWORD,
          newPassword,
        }).expect(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
        expect(
          (res.body as { details: { field: string }[] }).details.map(
            (d) => d.field,
          ),
        ).toEqual(['newPassword']);
      }
    });

    it('requires authentication', async () => {
      await http()
        .patch('/api/v1/auth/password')
        .send({ currentPassword: PASSWORD, newPassword: 'NewSecret42' })
        .expect(401);
    });
  });
});
