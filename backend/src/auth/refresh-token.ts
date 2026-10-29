import { createHash, randomBytes } from 'node:crypto';

/** 256 random bits, URL-safe: unguessable, so a fast hash is enough to store it. */
export const generateRefreshToken = (): string =>
  randomBytes(32).toString('base64url');

/**
 * Refresh tokens are stored only as SHA-256 hashes, so a copy of the database cannot be used to
 * sign in. Unlike passwords they are long and random, so a slow hash like bcrypt is not needed.
 */
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
