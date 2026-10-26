import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AppException, ErrorCode } from '../errors/app-error';
import type { AuthenticatedUser } from '../types/authenticated-user';

// Runs after the JWT guard; routes without @Roles() are open to any authenticated user.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) {
      return true;
    }
    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    if (!user || !roles.includes(user.role)) {
      throw new AppException(
        ErrorCode.FORBIDDEN,
        'You do not have permission to perform this action',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
