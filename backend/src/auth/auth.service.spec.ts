import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AppException, ErrorCode } from '../common/errors/app-error';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

const compare = bcrypt.compare as unknown as jest.Mock<
  Promise<boolean>,
  [string, string]
>;

const user: User = {
  id: 'user-id',
  email: 'operator1@demo.test',
  name: 'Olivia Operator',
  role: Role.OPERATOR,
  passwordHash: '$2b$10$real.user.hash',
  createdAt: new Date(),
};

describe('AuthService', () => {
  let users: jest.Mocked<Pick<UsersService, 'findByEmail' | 'toDto'>>;
  let service: AuthService;

  beforeEach(() => {
    compare.mockReset();
    users = {
      findByEmail: jest.fn(),
      toDto: jest.fn(({ id, email, name, role }: User) => ({
        id,
        email,
        name,
        role,
      })),
    };
    service = new AuthService(
      users as unknown as UsersService,
      {
        signAsync: jest.fn().mockResolvedValue('signed-token'),
      } as unknown as JwtService,
    );
  });

  const expectInvalidCredentials = async (promise: Promise<unknown>) => {
    const error: unknown = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect((error as AppException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  };

  it('returns a token and the user for valid credentials', async () => {
    users.findByEmail.mockResolvedValue(user);
    compare.mockResolvedValue(true);

    await expect(
      service.login({ email: user.email, password: 'Password123!' }),
    ).resolves.toEqual({
      accessToken: 'signed-token',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  });

  it('rejects a wrong password', async () => {
    users.findByEmail.mockResolvedValue(user);
    compare.mockResolvedValue(false);

    await expectInvalidCredentials(
      service.login({ email: user.email, password: 'WrongPassword1' }),
    );
    expect(compare).toHaveBeenCalledWith('WrongPassword1', user.passwordHash);
  });

  it('still runs a bcrypt comparison for an unknown email', async () => {
    users.findByEmail.mockResolvedValue(null);
    compare.mockResolvedValue(false);

    await expectInvalidCredentials(
      service.login({ email: 'nobody@demo.test', password: 'WrongPassword1' }),
    );
    // Same work as a wrong password, so response times do not reveal which emails exist.
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare.mock.calls[0][1]).toMatch(/^\$2[aby]\$10\$/);
  });
});
