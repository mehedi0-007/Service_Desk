import type { SessionRevokeReason } from '@prisma/client';

export const SessionEvents = {
  Revoked: 'session.revoked',
} as const;

/** Published after sessions are revoked, so their open WebSocket connections can be closed. */
export type SessionsRevokedEvent = {
  sessionIds: string[];
  reason: SessionRevokeReason;
};
