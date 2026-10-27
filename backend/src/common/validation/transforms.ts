import { Transform } from 'class-transformer';

/** Trims string input before validation; other values pass through for the validators to reject. */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Accepts `a,b` as well as repeated `?x=a&x=b` query parameters and returns a string array. */
export const CommaSeparated = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parts = (Array.isArray(value) ? value : [value]).flatMap((part) =>
      String(part).split(','),
    );
    return parts.map((part) => part.trim()).filter(Boolean);
  });
