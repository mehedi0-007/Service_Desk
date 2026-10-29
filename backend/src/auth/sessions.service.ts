import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Session, SessionRevokeReason } from '@prisma/client';
import { refreshConflict, sessionExpired } from '../common/errors/app-error';
import { appConfig } from '../config/app.config';
import type { AppConfig } from '../config/app.config';
import { generateRefreshToken, hashRefreshToken } from './refresh-token';
import { SessionEvents, SessionsRevokedEvent } from './session-events';
import {
  RevokeFilter,
  SessionsRepository,
  SessionWithUser,
} from './sessions.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Refresh-token sessions. Each refresh replaces the token (rotation); presenting a replaced token
 * again means it was copied, so the whole session is revoked (reuse detection).
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly repository: SessionsRepository,
    private readonly events: EventEmitter2,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
  ) {}

  async start(
    userId: string,
    userAgent?: string,
  ): Promise<{ session: Session; refreshToken: string }> {
    const refreshToken = generateRefreshToken();
    const now = Date.now();
    const session = await this.repository.create({
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: this.expiryFrom(now, now),
      userAgent: userAgent?.slice(0, 255),
    });
    return { session, refreshToken };
  }

  async refresh(
    token: string | undefined,
  ): Promise<{ session: SessionWithUser; refreshToken: string }> {
    if (!token) {
      throw sessionExpired();
    }
    const presentedHash = hashRefreshToken(token);
    const session = await this.repository.findByTokenHash(presentedHash);
    if (!session) {
      await this.handleUnknownToken(presentedHash);
      throw sessionExpired();
    }

    const now = Date.now();
    if (session.revokedAt || session.expiresAt.getTime() <= now) {
      throw sessionExpired();
    }

    const refreshToken = generateRefreshToken();
    const expiresAt = this.expiryFrom(now, session.createdAt.getTime());
    const rotated = await this.repository.rotate({
      id: session.id,
      presentedHash,
      newHash: hashRefreshToken(refreshToken),
      expiresAt,
    });
    if (rotated === 0) {
      // Another request rotated or revoked the session between our read and our write.
      throw refreshConflict();
    }
    return { session: { ...session, expiresAt }, refreshToken };
  }

  findActive(id: string): Promise<SessionWithUser | null> {
    return this.repository.findActive(id);
  }

  async revoke(id: string, reason: SessionRevokeReason): Promise<void> {
    await this.revokeWhere({ id }, reason);
  }

  async revokeByToken(
    token: string | undefined,
    reason: SessionRevokeReason,
  ): Promise<void> {
    if (!token) {
      return;
    }
    const session = await this.repository.findByTokenHash(
      hashRefreshToken(token),
    );
    if (session) {
      await this.revokeWhere({ id: session.id }, reason);
    }
  }

  async revokeAllForUser(
    userId: string,
    reason: SessionRevokeReason,
    exceptSessionId?: string,
  ): Promise<void> {
    await this.revokeWhere(
      exceptSessionId ? { userId, exceptId: exceptSessionId } : { userId },
      reason,
    );
  }

  /**
   * A token that is not current may be the one replaced by the last rotation. Shortly after the
   * rotation that is a race (two tabs refreshing at once): the caller retries with the cookie the
   * browser now holds. Later it means the token was copied, so the session is revoked.
   */
  private async handleUnknownToken(presentedHash: string): Promise<void> {
    const rotatedSession =
      await this.repository.findByPreviousHash(presentedHash);
    if (!rotatedSession || rotatedSession.revokedAt) {
      return;
    }
    const sinceRotation =
      Date.now() - (rotatedSession.rotatedAt?.getTime() ?? 0);
    if (sinceRotation < this.config.session.reuseGraceSeconds * 1000) {
      throw refreshConflict();
    }
    this.logger.warn(
      `Refresh token reused for session ${rotatedSession.id}; revoking it`,
    );
    await this.revokeWhere(
      { id: rotatedSession.id },
      SessionRevokeReason.TOKEN_REUSE,
    );
  }

  private async revokeWhere(
    filter: RevokeFilter,
    reason: SessionRevokeReason,
  ): Promise<void> {
    const sessionIds = await this.repository.revoke(filter, reason);
    if (sessionIds.length > 0) {
      this.events.emit(SessionEvents.Revoked, {
        sessionIds,
        reason,
      } satisfies SessionsRevokedEvent);
    }
  }

  /** Sliding expiry, capped at the maximum session age counted from sign-in. */
  private expiryFrom(now: number, createdAt: number): Date {
    const { refreshTtlDays, maxAgeDays } = this.config.session;
    return new Date(
      Math.min(now + refreshTtlDays * DAY_MS, createdAt + maxAgeDays * DAY_MS),
    );
  }
}
