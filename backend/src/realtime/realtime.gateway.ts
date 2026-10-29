import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role, SessionRevokeReason } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/jwt.strategy';
import { SessionsService } from '../auth/sessions.service';
import type { RequestAudience } from '../requests/request-events';

type SocketUser = { id: string; role: Role; sessionId: string };
type SocketData = { user?: SocketUser; expiryTimer?: NodeJS.Timeout };

export const SUPERVISORS_ROOM = `role:${Role.SUPERVISOR}`;
export const userRoom = (userId: string): string => `user:${userId}`;
export const sessionRoom = (sessionId: string): string =>
  `session:${sessionId}`;

// setTimeout fires immediately for delays above 2^31 - 1 ms (about 24.8 days).
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Server-to-client push channel. Clients authenticate with their JWT during the handshake and
 * are placed in rooms; rooms decide who receives which request events. A socket lives no longer
 * than its access token and its session: the client reconnects with a fresh token.
 */
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const authenticated = await this.authenticate(socket);
    // The client may have left while the token was checked; handleDisconnect has already run.
    if (socket.disconnected) {
      return;
    }
    if (!authenticated) {
      socket.emit('error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
      return;
    }

    const { user, expiresAt } = authenticated;
    const data = socket.data as SocketData;
    data.user = user;
    // Disconnect when the access token expires; the client reconnects with a refreshed one.
    // unref: a pending expiry must not keep the process alive during shutdown.
    data.expiryTimer = setTimeout(
      () => socket.disconnect(true),
      Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMER_MS),
    ).unref();
    await socket.join([userRoom(user.id), sessionRoom(user.sessionId)]);
    if (user.role === Role.SUPERVISOR) {
      await socket.join(SUPERVISORS_ROOM);
    }
    this.logger.debug(`Socket ${socket.id} connected for user ${user.id}`);
  }

  handleDisconnect(socket: Socket): void {
    const { user, expiryTimer } = socket.data as SocketData;
    clearTimeout(expiryTimer);
    this.logger.debug(
      `Socket ${socket.id} disconnected${user ? ` for user ${user.id}` : ''}`,
    );
  }

  /**
   * Sends an event to all supervisors, the request's creator and its assignee. One emit to
   * several rooms delivers once per socket, even if a socket is in more than one of them.
   */
  emitToAudience(
    event: string,
    payload: unknown,
    audience: RequestAudience,
  ): void {
    const rooms = [SUPERVISORS_ROOM, userRoom(audience.createdById)];
    if (audience.assignedToId) {
      rooms.push(userRoom(audience.assignedToId));
    }
    this.server.to(rooms).emit(event, payload);
  }

  /** Tells the sockets of revoked sessions why, then closes them. */
  disconnectSessions(sessionIds: string[], reason: SessionRevokeReason): void {
    const rooms = sessionIds.map(sessionRoom);
    this.server.to(rooms).emit('session.revoked', { reason });
    this.server.in(rooms).disconnectSockets(true);
  }

  private async authenticate(
    socket: Socket,
  ): Promise<{ user: SocketUser; expiresAt: number } | null> {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const header = socket.handshake.headers.authorization;
    const token =
      typeof auth?.token === 'string'
        ? auth.token
        : header?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return null;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload & { exp: number }>(
        token,
        { algorithms: ['HS256'] },
      );
      if (!payload.sid) {
        return null;
      }
      const session = await this.sessions.findActive(payload.sid);
      if (!session || session.userId !== payload.sub) {
        return null;
      }
      return {
        user: {
          id: session.user.id,
          role: session.user.role,
          sessionId: session.id,
        },
        expiresAt: payload.exp * 1000,
      };
    } catch {
      return null;
    }
  }
}
