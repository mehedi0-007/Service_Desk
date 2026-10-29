import type { CookieOptions, Request, Response } from 'express';
import type { AppConfig } from '../config/app.config';

export const REFRESH_COOKIE = 'sd_refresh';

/**
 * httpOnly so scripts can never read it; sent only to the auth routes. In production the
 * frontend runs on another site, so the cookie must be SameSite=None (which requires Secure).
 * Locally both run on localhost, which counts as the same site, so Lax over plain HTTP works.
 */
function cookieOptions(config: AppConfig): CookieOptions {
  const production = config.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/api/v1/auth',
  };
}

export function setRefreshCookie(
  res: Response,
  config: AppConfig,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...cookieOptions(config),
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response, config: AppConfig): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(config));
}

export function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[
    REFRESH_COOKIE
  ];
  return typeof value === 'string' && value ? value : undefined;
}
