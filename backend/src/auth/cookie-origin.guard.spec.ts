import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { AppException, ErrorCode } from '../common/errors/app-error';
import type { AppConfig } from '../config/app.config';
import { CookieOriginGuard } from './cookie-origin.guard';

const contextFor = (headers: Record<string, string>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('CookieOriginGuard', () => {
  const guard = new CookieOriginGuard({
    corsOrigins: ['https://service-desk.vercel.app'],
  } as AppConfig);

  it('allows the frontend origin', () => {
    expect(
      guard.canActivate(
        contextFor({
          origin: 'https://service-desk.vercel.app',
          host: 'api.onrender.com',
        }),
      ),
    ).toBe(true);
  });

  it("allows the API's own origin (Swagger UI)", () => {
    expect(
      guard.canActivate(
        contextFor({
          origin: 'https://api.onrender.com',
          host: 'api.onrender.com',
        }),
      ),
    ).toBe(true);
  });

  it('allows clients that send no Origin (curl, server-to-server)', () => {
    // Browsers always send Origin on cross-site POSTs, so a forged request cannot omit it.
    expect(guard.canActivate(contextFor({ host: 'api.onrender.com' }))).toBe(
      true,
    );
  });

  it('rejects any other origin', () => {
    let error: unknown;
    try {
      guard.canActivate(
        contextFor({
          origin: 'https://evil.example',
          host: 'api.onrender.com',
        }),
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(ErrorCode.FORBIDDEN);
    expect((error as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
  });

  it('rejects a malformed Origin header', () => {
    expect(() =>
      guard.canActivate(
        contextFor({ origin: 'null', host: 'api.onrender.com' }),
      ),
    ).toThrow(AppException);
  });
});
