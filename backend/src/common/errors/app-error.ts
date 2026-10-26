import { HttpException, HttpStatus } from '@nestjs/common';

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  VERSION_CONFLICT = 'VERSION_CONFLICT',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
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

export const versionConflict = (): AppException =>
  new AppException(
    ErrorCode.VERSION_CONFLICT,
    'The request was modified by someone else. Reload and try again.',
    HttpStatus.CONFLICT,
  );
