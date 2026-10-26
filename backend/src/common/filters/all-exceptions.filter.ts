import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppException, ErrorCode } from '../errors/app-error';

type ErrorBody = {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details: unknown;
  path: string;
  timestamp: string;
  requestId: string | null;
};

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const response = ctx.getResponse<Response>();

    const { statusCode, code, message, details } = this.describe(exception);
    if (statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode,
      code,
      message,
      details,
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
      requestId: request.id ?? null,
    };
    response.status(statusCode).json(body);
  }

  private describe(
    exception: unknown,
  ): Pick<ErrorBody, 'statusCode' | 'code' | 'message' | 'details'> {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode: HttpStatus = exception.getStatus();
      return {
        statusCode,
        code: CODE_BY_STATUS[statusCode] ?? ErrorCode.BAD_REQUEST,
        message:
          statusCode === HttpStatus.TOO_MANY_REQUESTS
            ? 'Too many requests. Please try again later.'
            : exception.message,
        details: null,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: 'Resource not found',
          details: null,
        };
      }
      if (exception.code === 'P2002') {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT,
          message: 'A resource with the same unique value already exists',
          details: null,
        };
      }
    }

    // Never expose internal error details to clients; they are logged above.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      details: null,
    };
  }
}
