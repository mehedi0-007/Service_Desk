import { Injectable } from '@nestjs/common';
import { Session, SessionRevokeReason, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SessionWithUser = Session & { user: User };

export type CreateSessionInput = {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
};

export type RotateInput = {
  id: string;
  presentedHash: string;
  newHash: string;
  expiresAt: Date;
};

/** Which active sessions to revoke: one session, or all of a user's except one. */
export type RevokeFilter =
  { id: string } | { userId: string; exceptId?: string };

/** The only class that reads or writes sessions. */
@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateSessionInput): Promise<Session> {
    return this.prisma.session.create({ data: input });
  }

  findByTokenHash(hash: string): Promise<SessionWithUser | null> {
    return this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });
  }

  findByPreviousHash(hash: string): Promise<Session | null> {
    return this.prisma.session.findFirst({
      where: { previousTokenHash: hash },
    });
  }

  /** The session with its user, if it is neither revoked nor expired. One query per API request. */
  findActive(id: string): Promise<SessionWithUser | null> {
    return this.prisma.session.findFirst({
      where: { id, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
  }

  /**
   * Compare-and-set rotation: succeeds only while the presented token is still the current one
   * and the session is not revoked. Returns 0 when a parallel refresh or a logout came first.
   */
  async rotate(input: RotateInput): Promise<number> {
    const now = new Date();
    const { count } = await this.prisma.session.updateMany({
      where: {
        id: input.id,
        refreshTokenHash: input.presentedHash,
        revokedAt: null,
      },
      data: {
        refreshTokenHash: input.newHash,
        previousTokenHash: input.presentedHash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: input.expiresAt,
      },
    });
    return count;
  }

  /** Revokes the matching active sessions and returns their ids. */
  revoke(filter: RevokeFilter, reason: SessionRevokeReason): Promise<string[]> {
    const where =
      'id' in filter
        ? { id: filter.id, revokedAt: null }
        : {
            userId: filter.userId,
            revokedAt: null,
            ...(filter.exceptId && { id: { not: filter.exceptId } }),
          };
    return this.prisma.$transaction(async (tx) => {
      const sessions = await tx.session.findMany({
        where,
        select: { id: true },
      });
      const ids = sessions.map((session) => session.id);
      if (ids.length > 0) {
        await tx.session.updateMany({
          where: { id: { in: ids }, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: reason },
        });
      }
      return ids;
    });
  }
}
