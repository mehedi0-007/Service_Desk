import { HttpStatus } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role, Session, SessionRevokeReason, User } from '@prisma/client';
import { AppException, ErrorCode } from '../common/errors/app-error';
import type { AppConfig } from '../config/app.config';
import { hashRefreshToken } from './refresh-token';
import { SessionEvents } from './session-events';
import { SessionsRepository, SessionWithUser } from './sessions.repository';
import { SessionsService } from './sessions.service';

const NOW = new Date('2026-10-29T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const user: User = {
  id: 'user-id',
  email: 'operator1@demo.test',
  name: 'Olivia Operator',
  role: Role.OPERATOR,
  passwordHash: '$2b$10$hash',
  createdAt: NOW,
};

const sessionRow = (overrides: Partial<Session> = {}): SessionWithUser => ({
  id: 'session-id',
  userId: user.id,
  refreshTokenHash: hashRefreshToken('current-token'),
  previousTokenHash: null,
  rotatedAt: null,
  expiresAt: new Date(NOW.getTime() + 7 * DAY),
  revokedAt: null,
  revokedReason: null,
  userAgent: null,
  createdAt: new Date(NOW.getTime() - DAY),
  lastUsedAt: new Date(NOW.getTime() - DAY),
  user,
  ...overrides,
});

describe('SessionsService', () => {
  let repository: jest.Mocked<
    Pick<
      SessionsRepository,
      | 'create'
      | 'findByTokenHash'
      | 'findByPreviousHash'
      | 'findActive'
      | 'rotate'
      | 'revoke'
    >
  >;
  let events: { emit: jest.Mock };
  let service: SessionsService;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    repository = {
      create: jest.fn(),
      findByTokenHash: jest.fn().mockResolvedValue(null),
      findByPreviousHash: jest.fn().mockResolvedValue(null),
      findActive: jest.fn(),
      rotate: jest.fn().mockResolvedValue(1),
      revoke: jest.fn().mockResolvedValue([]),
    };
    events = { emit: jest.fn() };
    service = new SessionsService(
      repository as unknown as SessionsRepository,
      events as unknown as EventEmitter2,
      {
        session: { refreshTtlDays: 7, maxAgeDays: 30, reuseGraceSeconds: 30 },
      } as AppConfig,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const expectError = async (
    promise: Promise<unknown>,
    code: ErrorCode,
    status: HttpStatus,
  ) => {
    const error: unknown = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
    expect((error as AppException).getStatus()).toBe(status);
  };

  describe('start', () => {
    it('stores only the hash of a random refresh token', async () => {
      repository.create.mockImplementation((data) =>
        Promise.resolve(sessionRow(data)),
      );

      const { refreshToken } = await service.start(user.id, 'Mozilla/5.0');

      expect(refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(repository.create).toHaveBeenCalledWith({
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(NOW.getTime() + 7 * DAY),
        userAgent: 'Mozilla/5.0',
      });
      expect(hashRefreshToken(refreshToken)).not.toBe(refreshToken);
    });

    it('creates a different token for every session', async () => {
      repository.create.mockImplementation((data) =>
        Promise.resolve(sessionRow(data)),
      );
      const first = await service.start(user.id);
      const second = await service.start(user.id);
      expect(first.refreshToken).not.toBe(second.refreshToken);
    });
  });

  describe('refresh', () => {
    it('rotates the token with a compare-and-set update', async () => {
      repository.findByTokenHash.mockResolvedValue(sessionRow());

      const { refreshToken, session } = await service.refresh('current-token');

      expect(refreshToken).not.toBe('current-token');
      expect(repository.rotate).toHaveBeenCalledWith({
        id: 'session-id',
        presentedHash: hashRefreshToken('current-token'),
        newHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(NOW.getTime() + 7 * DAY),
      });
      expect(session.user).toEqual(user);
      expect(session.expiresAt).toEqual(new Date(NOW.getTime() + 7 * DAY));
    });

    it('never extends a session past its maximum age', async () => {
      const createdAt = new Date(NOW.getTime() - 28 * DAY);
      repository.findByTokenHash.mockResolvedValue(sessionRow({ createdAt }));

      await service.refresh('current-token');

      expect(repository.rotate).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: new Date(createdAt.getTime() + 30 * DAY),
        }),
      );
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['unknown', 'unknown-token'],
    ])('rejects a %s token with SESSION_EXPIRED', async (_label, token) => {
      await expectError(
        service.refresh(token),
        ErrorCode.SESSION_EXPIRED,
        HttpStatus.UNAUTHORIZED,
      );
      expect(repository.rotate).not.toHaveBeenCalled();
    });

    it('rejects an expired session', async () => {
      repository.findByTokenHash.mockResolvedValue(
        sessionRow({ expiresAt: new Date(NOW.getTime() - 1) }),
      );
      await expectError(
        service.refresh('current-token'),
        ErrorCode.SESSION_EXPIRED,
        HttpStatus.UNAUTHORIZED,
      );
      expect(repository.rotate).not.toHaveBeenCalled();
    });

    it('rejects a revoked session', async () => {
      repository.findByTokenHash.mockResolvedValue(
        sessionRow({
          revokedAt: NOW,
          revokedReason: SessionRevokeReason.LOGOUT,
        }),
      );
      await expectError(
        service.refresh('current-token'),
        ErrorCode.SESSION_EXPIRED,
        HttpStatus.UNAUTHORIZED,
      );
    });

    it('reports a conflict when a parallel refresh rotated the token first', async () => {
      repository.findByTokenHash.mockResolvedValue(sessionRow());
      repository.rotate.mockResolvedValue(0);

      await expectError(
        service.refresh('current-token'),
        ErrorCode.REFRESH_CONFLICT,
        HttpStatus.CONFLICT,
      );
    });

    it('treats the previous token within the grace period as a race, not theft', async () => {
      repository.findByPreviousHash.mockResolvedValue(
        sessionRow({
          refreshTokenHash: hashRefreshToken('newer-token'),
          previousTokenHash: hashRefreshToken('current-token'),
          rotatedAt: new Date(NOW.getTime() - 10_000),
        }),
      );

      await expectError(
        service.refresh('current-token'),
        ErrorCode.REFRESH_CONFLICT,
        HttpStatus.CONFLICT,
      );
      expect(repository.revoke).not.toHaveBeenCalled();
    });

    it('revokes the session when a rotated token is reused after the grace period', async () => {
      repository.findByPreviousHash.mockResolvedValue(
        sessionRow({
          refreshTokenHash: hashRefreshToken('newer-token'),
          previousTokenHash: hashRefreshToken('current-token'),
          rotatedAt: new Date(NOW.getTime() - 60_000),
        }),
      );
      repository.revoke.mockResolvedValue(['session-id']);

      await expectError(
        service.refresh('current-token'),
        ErrorCode.SESSION_EXPIRED,
        HttpStatus.UNAUTHORIZED,
      );
      expect(repository.revoke).toHaveBeenCalledWith(
        { id: 'session-id' },
        SessionRevokeReason.TOKEN_REUSE,
      );
      expect(events.emit).toHaveBeenCalledWith(SessionEvents.Revoked, {
        sessionIds: ['session-id'],
        reason: SessionRevokeReason.TOKEN_REUSE,
      });
    });

    it('does not revoke again when the reused token belongs to an already revoked session', async () => {
      repository.findByPreviousHash.mockResolvedValue(
        sessionRow({
          previousTokenHash: hashRefreshToken('current-token'),
          rotatedAt: new Date(NOW.getTime() - 60_000),
          revokedAt: NOW,
        }),
      );

      await expectError(
        service.refresh('current-token'),
        ErrorCode.SESSION_EXPIRED,
        HttpStatus.UNAUTHORIZED,
      );
      expect(repository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('revokes the session of a refresh token and announces it', async () => {
      repository.findByTokenHash.mockResolvedValue(sessionRow());
      repository.revoke.mockResolvedValue(['session-id']);

      await service.revokeByToken('current-token', SessionRevokeReason.LOGOUT);

      expect(repository.revoke).toHaveBeenCalledWith(
        { id: 'session-id' },
        SessionRevokeReason.LOGOUT,
      );
      expect(events.emit).toHaveBeenCalledWith(SessionEvents.Revoked, {
        sessionIds: ['session-id'],
        reason: SessionRevokeReason.LOGOUT,
      });
    });

    it('does nothing for an unknown token', async () => {
      await service.revokeByToken('unknown', SessionRevokeReason.LOGOUT);
      await service.revokeByToken(undefined, SessionRevokeReason.LOGOUT);
      expect(repository.revoke).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('revokes all other sessions of a user', async () => {
      repository.revoke.mockResolvedValue(['a', 'b']);

      await service.revokeAllForUser(
        user.id,
        SessionRevokeReason.PASSWORD_CHANGED,
        'session-id',
      );

      expect(repository.revoke).toHaveBeenCalledWith(
        { userId: user.id, exceptId: 'session-id' },
        SessionRevokeReason.PASSWORD_CHANGED,
      );
      expect(events.emit).toHaveBeenCalledWith(SessionEvents.Revoked, {
        sessionIds: ['a', 'b'],
        reason: SessionRevokeReason.PASSWORD_CHANGED,
      });
    });

    it('does not announce anything when no session was active', async () => {
      repository.revoke.mockResolvedValue([]);
      await service.revokeAllForUser(user.id, SessionRevokeReason.LOGOUT_ALL);
      expect(events.emit).not.toHaveBeenCalled();
    });
  });
});
