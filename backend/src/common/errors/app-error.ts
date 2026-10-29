import { HttpException, HttpStatus } from '@nestjs/common';

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  REFRESH_CONFLICT = 'REFRESH_CONFLICT',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  VERSION_CONFLICT = 'VERSION_CONFLICT',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export type FieldError = { field: string; messages: string[] };

export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details: unknown = null,
  ) {
    super(message, status);
  }
}

export const notFound = (entity: string): AppException =>
  new AppException(
    ErrorCode.NOT_FOUND,
    `${entity} not found`,
    HttpStatus.NOT_FOUND,
  );

export const invalidTransition = (from: string, to: string): AppException =>
  new AppException(
    ErrorCode.INVALID_TRANSITION,
    `Cannot change status from ${from} to ${to}`,
    HttpStatus.CONFLICT,
  );

export const sessionExpired = (): AppException =>
  new AppException(
    ErrorCode.SESSION_EXPIRED,
    'Your session has ended. Please sign in again.',
    HttpStatus.UNAUTHORIZED,
  );

export const refreshConflict = (): AppException =>
  new AppException(
    ErrorCode.REFRESH_CONFLICT,
    'The session was renewed by another request. Try again.',
    HttpStatus.CONFLICT,
  );

/** A validation error on one field, in the same shape as the validation pipe's errors. */
export const fieldError = (field: string, message: string): AppException =>
  new AppException(
    ErrorCode.VALIDATION_ERROR,
    'Validation failed',
    HttpStatus.BAD_REQUEST,
    [{ field, messages: [message] }],
  );

export const versionConflict = (): AppException =>
  new AppException(
    ErrorCode.VERSION_CONFLICT,
    'The request was modified by someone else. Reload and try again.',
    HttpStatus.CONFLICT,
  );
