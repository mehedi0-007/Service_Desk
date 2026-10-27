import { HttpStatus } from '@nestjs/common';
import { RequestStatus, Role } from '@prisma/client';
import {
  AppException,
  ErrorCode,
  invalidTransition,
} from '../common/errors/app-error';

export type Actor =
  { kind: 'SYSTEM' } | { kind: 'USER'; userId: string; role: Role };

export const SYSTEM_ACTOR: Actor = { kind: 'SYSTEM' };

export const CANCELLABLE: readonly RequestStatus[] = [
  RequestStatus.QUEUED,
  RequestStatus.IN_PROGRESS,
];

export const TERMINAL: readonly RequestStatus[] = [
  RequestStatus.COMPLETED,
  RequestStatus.FAILED,
  RequestStatus.CANCELLED,
];

const RETRYABLE: readonly RequestStatus[] = [
  RequestStatus.FAILED,
  RequestStatus.CANCELLED,
];

type Rule = {
  from: readonly RequestStatus[];
  to: RequestStatus;
  by: Actor['kind'];
  // Only checked for user transitions: which users may perform it.
  permits?: (role: Role, isOwner: boolean) => boolean;
};

const isSupervisor = (role: Role): boolean => role === Role.SUPERVISOR;

const RULES: readonly Rule[] = [
  { from: [RequestStatus.QUEUED], to: RequestStatus.IN_PROGRESS, by: 'SYSTEM' },
  {
    from: [RequestStatus.IN_PROGRESS],
    to: RequestStatus.COMPLETED,
    by: 'SYSTEM',
  },
  { from: [RequestStatus.IN_PROGRESS], to: RequestStatus.FAILED, by: 'SYSTEM' },
  // Startup recovery puts interrupted work back in the queue.
  { from: [RequestStatus.IN_PROGRESS], to: RequestStatus.QUEUED, by: 'SYSTEM' },
  {
    from: CANCELLABLE,
    to: RequestStatus.CANCELLED,
    by: 'USER',
    permits: (role, isOwner) => isSupervisor(role) || isOwner,
  },
  {
    from: RETRYABLE,
    to: RequestStatus.QUEUED,
    by: 'USER',
    permits: (role) => isSupervisor(role),
  },
];

const findRule = (
  from: RequestStatus,
  to: RequestStatus,
  by: Actor['kind'],
): Rule | undefined =>
  RULES.find(
    (rule) => rule.by === by && rule.to === to && rule.from.includes(from),
  );

const isPermitted = (rule: Rule, actor: Actor, ownerId: string): boolean =>
  actor.kind === 'SYSTEM' ||
  (rule.permits?.(actor.role, actor.userId === ownerId) ?? false);

export function canTransition(
  from: RequestStatus,
  to: RequestStatus,
  actor: Actor,
  ownerId: string,
): boolean {
  const rule = findRule(from, to, actor.kind);
  return rule !== undefined && isPermitted(rule, actor, ownerId);
}

/**
 * Throws 409 INVALID_TRANSITION when the transition does not exist for this kind of actor,
 * and 403 FORBIDDEN when it exists but this user may not perform it.
 */
export function assertTransition(
  from: RequestStatus,
  to: RequestStatus,
  actor: Actor,
  ownerId: string,
): void {
  const rule = findRule(from, to, actor.kind);
  if (!rule) {
    throw invalidTransition(from, to);
  }
  if (!isPermitted(rule, actor, ownerId)) {
    throw new AppException(
      ErrorCode.FORBIDDEN,
      'You do not have permission to perform this action',
      HttpStatus.FORBIDDEN,
    );
  }
}

/** Status targets a user may choose for a request in the given status. */
export function allowedUserTransitions(
  status: RequestStatus,
  role: Role,
  isOwner: boolean,
): RequestStatus[] {
  return RULES.filter(
    (rule) =>
      rule.by === 'USER' &&
      rule.from.includes(status) &&
      (rule.permits?.(role, isOwner) ?? false),
  ).map((rule) => rule.to);
}
