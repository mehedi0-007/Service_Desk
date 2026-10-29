import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppException, ErrorCode } from '../common/errors/app-error';
import { appConfig } from '../config/app.config';
import type { AppConfig } from '../config/app.config';

/**
 * CSRF protection for the endpoints that read the refresh cookie. The cookie is cross-site
 * (SameSite=None), so browsers attach it to requests started by any website. Browsers always
 * send an Origin header with such requests and pages cannot change it, so only the frontend's
 * origins and the API's own (Swagger UI) are accepted. Clients without an Origin header are not
 * browsers and cannot be tricked into sending someone else's cookie.
 */
@Injectable()
export class CookieOriginGuard implements CanActivate {
  constructor(@Inject(appConfig.KEY) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const { headers } = context.switchToHttp().getRequest<Request>();
    const origin = headers.origin;
    if (
      !origin ||
      this.config.corsOrigins.includes(origin) ||
      hostOf(origin) === headers.host
    ) {
      return true;
    }
    throw new AppException(
      ErrorCode.FORBIDDEN,
      'Request origin not allowed',
      HttpStatus.FORBIDDEN,
    );
  }
}

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
