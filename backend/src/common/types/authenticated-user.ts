import type { Role } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** The session the access token belongs to; logout and password change act on it. */
  sessionId: string;
}
