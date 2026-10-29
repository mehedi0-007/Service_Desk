import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SessionRevokeReason, User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import {
  AppException,
  ErrorCode,
  fieldError,
} from '../common/errors/app-error';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { appConfig } from '../config/app.config';
import type { AppConfig } from '../config/app.config';
import { UserDto } from '../users/dto/user.response';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './jwt.strategy';
import { SessionsService } from './sessions.service';

// A bcrypt hash of a random, discarded value, with the same cost as real passwords. Comparing
// against it when the email is unknown makes both failure paths take the same time.
const DUMMY_PASSWORD_HASH =
  '$2b$10$Qkx.ZRou9LWSz1o/JHUo3OIGd5on33t6v5Is.Fm6Ipvax7ZpFUTWK';

const BCRYPT_COST = 10;

/** What a login or refresh produces; the controller puts the refresh token into the cookie. */
export type AuthResult = {
  accessToken: string;
  expiresIn: number;
  user: UserDto;
  refreshToken: string;
  refreshExpiresAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
  ) {}

  async login(dto: LoginDto, userAgent?: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);
    // Same error and the same work for an unknown email and a wrong password, so accounts
    // cannot be enumerated from the message or from the response time.
    const valid = await compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !valid) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const { session, refreshToken } = await this.sessions.start(
      user.id,
      userAgent,
    );
    return this.result(user, session.id, refreshToken, session.expiresAt);
  }

  async refresh(refreshToken: string | undefined): Promise<AuthResult> {
    const { session, refreshToken: rotated } =
      await this.sessions.refresh(refreshToken);
    return this.result(session.user, session.id, rotated, session.expiresAt);
  }

  /**
   * Ends the current session. The refresh cookie identifies it; browsers that block the
   * cross-site cookie send no cookie, so a valid access token identifies it instead.
   */
  async logout(tokens: {
    refreshToken?: string;
    accessToken?: string;
  }): Promise<void> {
    if (tokens.refreshToken) {
      await this.sessions.revokeByToken(
        tokens.refreshToken,
        SessionRevokeReason.LOGOUT,
      );
      return;
    }
    if (!tokens.accessToken) {
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(
        tokens.accessToken,
        { algorithms: ['HS256'] },
      );
      if (payload.sid) {
        await this.sessions.revoke(payload.sid, SessionRevokeReason.LOGOUT);
      }
    } catch {
      // An invalid or expired token has nothing left to log out.
    }
  }

  async logoutAll(user: AuthenticatedUser): Promise<void> {
    await this.sessions.revokeAllForUser(
      user.id,
      SessionRevokeReason.LOGOUT_ALL,
    );
  }

  /** Requires the current password; afterwards only the current session stays signed in. */
  async changePassword(
    user: AuthenticatedUser,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const account = await this.users.findById(user.id);
    if (
      !account ||
      !(await compare(dto.currentPassword, account.passwordHash))
    ) {
      // A field error rather than 401: the session is fine, only the input is wrong.
      throw fieldError('currentPassword', 'Current password is incorrect');
    }
    if (await compare(dto.newPassword, account.passwordHash)) {
      throw fieldError(
        'newPassword',
        'New password must be different from the current one',
      );
    }
    await this.users.updatePassword(
      user.id,
      await hash(dto.newPassword, BCRYPT_COST),
    );
    await this.sessions.revokeAllForUser(
      user.id,
      SessionRevokeReason.PASSWORD_CHANGED,
      user.sessionId,
    );
  }

  private async result(
    user: User,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      sid: sessionId,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.jwt.accessTokenTtlSeconds,
      user: this.users.toDto(user),
      refreshToken,
      refreshExpiresAt,
    };
  }
}
