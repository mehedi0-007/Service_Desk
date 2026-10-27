import { RequestStatus, Role } from '@prisma/client';
import { AppException, ErrorCode } from '../common/errors/app-error';
import {
  Actor,
  allowedUserTransitions,
  assertTransition,
  canTransition,
  SYSTEM_ACTOR,
} from './request-state-machine';

const { QUEUED, IN_PROGRESS, COMPLETED, FAILED, CANCELLED } = RequestStatus;
const STATUSES = Object.values(RequestStatus);

const OWNER_ID = 'owner-id';
const ACTORS: Record<string, Actor> = {
  system: SYSTEM_ACTOR,
  supervisor: { kind: 'USER', userId: 'supervisor-id', role: Role.SUPERVISOR },
  owner: { kind: 'USER', userId: OWNER_ID, role: Role.OPERATOR },
  otherOperator: { kind: 'USER', userId: 'other-id', role: Role.OPERATOR },
};

// The complete set of permitted transitions; every other combination must be rejected.
const ALLOWED: Record<string, Array<[RequestStatus, RequestStatus]>> = {
  system: [
    [QUEUED, IN_PROGRESS],
    [IN_PROGRESS, COMPLETED],
    [IN_PROGRESS, FAILED],
    [IN_PROGRESS, QUEUED],
  ],
  supervisor: [
    [QUEUED, CANCELLED],
    [IN_PROGRESS, CANCELLED],
    [FAILED, QUEUED],
    [CANCELLED, QUEUED],
  ],
  owner: [
    [QUEUED, CANCELLED],
    [IN_PROGRESS, CANCELLED],
  ],
  otherOperator: [],
};

const isAllowed = (actor: string, from: RequestStatus, to: RequestStatus) =>
  ALLOWED[actor].some(([f, t]) => f === from && t === to);

// Transitions some user may perform: users lacking permission get 403 rather than 409.
const isUserTransition = (from: RequestStatus, to: RequestStatus) =>
  isAllowed('supervisor', from, to);

function errorCodeOf(fn: () => void): ErrorCode | null {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    return (error as AppException).code;
  }
}

describe('request state machine', () => {
  const cases = Object.keys(ACTORS).flatMap((actor) =>
    STATUSES.flatMap((from) => STATUSES.map((to) => ({ actor, from, to }))),
  );

  it.each(cases)('$actor: $from -> $to', ({ actor, from, to }) => {
    const allowed = isAllowed(actor, from, to);
    expect(canTransition(from, to, ACTORS[actor], OWNER_ID)).toBe(allowed);

    const code = errorCodeOf(() =>
      assertTransition(from, to, ACTORS[actor], OWNER_ID),
    );
    if (allowed) {
      expect(code).toBeNull();
    } else if (actor !== 'system' && isUserTransition(from, to)) {
      expect(code).toBe(ErrorCode.FORBIDDEN);
    } else {
      expect(code).toBe(ErrorCode.INVALID_TRANSITION);
    }
  });

  it('reports an invalid transition with both statuses in the message', () => {
    expect(() =>
      assertTransition(COMPLETED, CANCELLED, ACTORS.supervisor, OWNER_ID),
    ).toThrow('Cannot change status from COMPLETED to CANCELLED');
  });

  describe('allowedUserTransitions', () => {
    it('lets the owner cancel active requests only', () => {
      expect(allowedUserTransitions(QUEUED, Role.OPERATOR, true)).toEqual([
        CANCELLED,
      ]);
      expect(allowedUserTransitions(IN_PROGRESS, Role.OPERATOR, true)).toEqual([
        CANCELLED,
      ]);
      expect(allowedUserTransitions(FAILED, Role.OPERATOR, true)).toEqual([]);
    });

    it('gives other operators no actions', () => {
      for (const status of STATUSES) {
        expect(allowedUserTransitions(status, Role.OPERATOR, false)).toEqual(
          [],
        );
      }
    });

    it('lets supervisors cancel active requests and retry finished ones', () => {
      expect(allowedUserTransitions(QUEUED, Role.SUPERVISOR, false)).toEqual([
        CANCELLED,
      ]);
      expect(allowedUserTransitions(FAILED, Role.SUPERVISOR, false)).toEqual([
        QUEUED,
      ]);
      expect(allowedUserTransitions(CANCELLED, Role.SUPERVISOR, false)).toEqual(
        [QUEUED],
      );
      expect(allowedUserTransitions(COMPLETED, Role.SUPERVISOR, false)).toEqual(
        [],
      );
    });
  });
});
