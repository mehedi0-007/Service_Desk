import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, Session, SessionRevokeReason, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AppException, ErrorCode } from '../common/errors/app-error';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { AppConfig } from '../config/app.config';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const compare = bcrypt.compare as unknown as jest.Mock<
  Promise<boolean>,
  [string, string]
>;
const hash = bcrypt.hash as unknown as jest.Mock<
  Promise<string>,
  [string, number]
>;

const user: User = {
  id: 'user-id',
  email: 'operator1@demo.test',
  name: 'Olivia Operator',
  role: Role.OPERATOR,
  passwordHash: '$2b$10$real.user.hash',
  createdAt: new Date(),
};

const session = { id: 'session-id', userId: user.id } as Session;
const expiresAt = new Date('2026-11-05T10:00:00.000Z');

const signedIn: AuthenticatedUser = {
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  sessionId: 'session-id',
};

describe('AuthService', () => {
  let users: jest.Mocked<
    Pick<UsersService, 'findByEmail' | 'findById' | 'toDto' | 'updatePassword'>
  >;
  let sessions: jest.Mocked<
    Pick<
      SessionsService,
      'start' | 'refresh' | 'revoke' | 'revokeByToken' | 'revokeAllForUser'
    >
  >;
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    compare.mockReset();
    hash.mockReset();
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn().mockResolvedValue(user),
      toDto: jest.fn(({ id, email, name, role }: User) => ({
        id,
        email,
        name,
        role,
      })),
      updatePassword: jest.fn(),
    };
    sessions = {
      start: jest.fn().mockResolvedValue({
        session: { ...session, expiresAt },
        refreshToken: 'refresh-token',
      }),
      refresh: jest.fn().mockResolvedValue({
        session: { ...session, expiresAt, user },
        refreshToken: 'rotated-token',
      }),
      revoke: jest.fn(),
      revokeByToken: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      verifyAsync: jest.fn(),
    };
    service = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
      sessions as unknown as SessionsService,
      { jwt: { accessTokenTtlSeconds: 900 } } as AppConfig,
    );
  });

  const expectError = async (
    promise: Promise<unknown>,
    code: ErrorCode,
    status: HttpStatus,
  ): Promise<AppException> => {
    const error: unknown = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(code);
    expect((error as AppException).getStatus()).toBe(status);
    return error as AppException;
  };

  describe('login', () => {
    it('starts a session and returns both tokens', async () => {
      users.findByEmail.mockResolvedValue(user);
      compare.mockResolvedValue(true);

      await expect(
        service.login(
          { email: user.email, password: 'Password123!' },
          'Mozilla/5.0',
        ),
      ).resolves.toEqual({
        accessToken: 'signed-token',
        expiresIn: 900,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        refreshToken: 'refresh-token',
        refreshExpiresAt: expiresAt,
      });
      expect(sessions.start).toHaveBeenCalledWith(user.id, 'Mozilla/5.0');
      // The access token names its session, so revoking the session revokes the token.
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: user.id,
        role: user.role,
        sid: 'session-id',
      });
    });

    it('rejects a wrong password without starting a session', async () => {
      users.findByEmail.mockResolvedValue(user);
      compare.mockResolvedValue(false);

      await expectError(
        service.login({ email: user.email, password: 'WrongPassword1' }),
        ErrorCode.INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
      expect(compare).toHaveBeenCalledWith('WrongPassword1', user.passwordHash);
      expect(sessions.start).not.toHaveBeenCalled();
    });

    it('still runs a bcrypt comparison for an unknown email', async () => {
      users.findByEmail.mockResolvedValue(null);
      compare.mockResolvedValue(false);

      await expectError(
        service.login({
          email: 'nobody@demo.test',
          password: 'WrongPassword1',
        }),
        ErrorCode.INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
      // Same work as a wrong password, so response times do not reveal which emails exist.
      expect(compare).toHaveBeenCalledTimes(1);
      expect(compare.mock.calls[0][1]).toMatch(/^\$2[aby]\$10\$/);
    });
  });

  describe('refresh', () => {
    it('issues a new access token for the rotated session', async () => {
      await expect(service.refresh('refresh-token')).resolves.toEqual({
        accessToken: 'signed-token',
        expiresIn: 900,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        refreshToken: 'rotated-token',
        refreshExpiresAt: expiresAt,
      });
      expect(sessions.refresh).toHaveBeenCalledWith('refresh-token');
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: user.id,
        role: user.role,
        sid: 'session-id',
      });
    });
  });

  describe('logout', () => {
    it('revokes the session of the refresh cookie', async () => {
      await service.logout({ refreshToken: 'refresh-token' });
      expect(sessions.revokeByToken).toHaveBeenCalledWith(
        'refresh-token',
        SessionRevokeReason.LOGOUT,
      );
      expect(sessions.revoke).not.toHaveBeenCalled();
    });

    it('falls back to the access token when the browser sent no cookie', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: user.id, sid: 'session-id' });

      await service.logout({ accessToken: 'access-token' });

      expect(sessions.revoke).toHaveBeenCalledWith(
        'session-id',
        SessionRevokeReason.LOGOUT,
      );
    });

    it('succeeds quietly when neither token is usable', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      await expect(
        service.logout({ accessToken: 'expired' }),
      ).resolves.toBeUndefined();
      await expect(service.logout({})).resolves.toBeUndefined();
      expect(sessions.revoke).not.toHaveBeenCalled();
    });

    it('signs a user out of every device', async () => {
      await service.logoutAll(signedIn);
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith(
        user.id,
        SessionRevokeReason.LOGOUT_ALL,
      );
    });
  });

  describe('changePassword', () => {
    const dto = { currentPassword: 'Password123!', newPassword: 'NewSecret42' };

    it('stores the new hash and signs out the other devices', async () => {
      compare
        .mockResolvedValueOnce(true) // current password matches
        .mockResolvedValueOnce(false); // new password differs
      hash.mockResolvedValue('$2b$10$new.hash');

      await service.changePassword(signedIn, dto);

      expect(hash).toHaveBeenCalledWith('NewSecret42', 10);
      expect(users.updatePassword).toHaveBeenCalledWith(
        user.id,
        '$2b$10$new.hash',
      );
      expect(sessions.revokeAllForUser).toHaveBeenCalledWith(
        user.id,
        SessionRevokeReason.PASSWORD_CHANGED,
        'session-id',
      );
    });

    it('rejects a wrong current password as a field error', async () => {
      compare.mockResolvedValue(false);

      const error = await expectError(
        service.changePassword(signedIn, dto),
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
      );
      // A 401 would make the client think its session ended.
      expect(error.details).toEqual([
        {
          field: 'currentPassword',
          messages: ['Current password is incorrect'],
        },
      ]);
      expect(users.updatePassword).not.toHaveBeenCalled();
      expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rejects a new password equal to the current one', async () => {
      compare.mockResolvedValue(true);

      const error = await expectError(
        service.changePassword(signedIn, {
          currentPassword: 'Password123!',
          newPassword: 'Password123!',
        }),
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
      );
      expect(error.details).toEqual([
        {
          field: 'newPassword',
          messages: ['New password must be different from the current one'],
        },
      ]);
      expect(users.updatePassword).not.toHaveBeenCalled();
    });
  });
});
