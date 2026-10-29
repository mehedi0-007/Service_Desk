import { Role, User } from '@prisma/client';
import type { AppConfig } from '../config/app.config';
import { JwtStrategy } from './jwt.strategy';
import type { SessionWithUser } from './sessions.repository';
import { SessionsService } from './sessions.service';

const user: User = {
  id: 'user-id',
  email: 'supervisor@demo.test',
  name: 'Sam Supervisor',
  role: Role.SUPERVISOR,
  passwordHash: '$2b$10$hash',
  createdAt: new Date(),
};

describe('JwtStrategy', () => {
  let findActive: jest.Mock<Promise<SessionWithUser | null>, [string]>;
  let strategy: JwtStrategy;

  beforeEach(() => {
    findActive = jest.fn<Promise<SessionWithUser | null>, [string]>();
    strategy = new JwtStrategy(
      { jwt: { secret: 'x'.repeat(32) } } as AppConfig,
      { findActive } as unknown as SessionsService,
    );
  });

  it('accepts a token whose session is active and returns the session id', async () => {
    findActive.mockResolvedValue({
      id: 'session-id',
      userId: user.id,
      user,
    } as SessionWithUser);

    await expect(
      strategy.validate({ sub: user.id, role: user.role, sid: 'session-id' }),
    ).resolves.toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionId: 'session-id',
    });
    expect(findActive).toHaveBeenCalledWith('session-id');
  });

  it('rejects a token whose session was revoked or has expired', async () => {
    findActive.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: user.id, role: user.role, sid: 'session-id' }),
    ).resolves.toBeNull();
  });

  it('rejects a token whose session belongs to another user', async () => {
    findActive.mockResolvedValue({
      id: 'session-id',
      userId: 'someone-else',
      user: { ...user, id: 'someone-else' },
    } as SessionWithUser);
    await expect(
      strategy.validate({ sub: user.id, role: user.role, sid: 'session-id' }),
    ).resolves.toBeNull();
  });

  it('rejects tokens issued without a session', async () => {
    await expect(
      strategy.validate({ sub: user.id, role: user.role } as never),
    ).resolves.toBeNull();
    expect(findActive).not.toHaveBeenCalled();
  });
});
