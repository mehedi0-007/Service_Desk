import { HttpStatus, ValidationError } from '@nestjs/common';
import { AppException, ErrorCode, FieldError } from '../errors/app-error';

function flatten(errors: ValidationError[], parentPath = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

export function validationExceptionFactory(
  errors: ValidationError[],
): AppException {
  return new AppException(
    ErrorCode.VALIDATION_ERROR,
    'Validation failed',
    HttpStatus.BAD_REQUEST,
    flatten(errors),
  );
}
