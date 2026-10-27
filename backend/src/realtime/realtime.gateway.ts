import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/jwt.strategy';
import type { RequestAudience } from '../requests/request-events';
import { UsersService } from '../users/users.service';

type SocketUser = { id: string; role: Role };

export const SUPERVISORS_ROOM = `role:${Role.SUPERVISOR}`;
export const userRoom = (userId: string): string => `user:${userId}`;

/**
 * Server-to-client push channel. Clients authenticate with their JWT during the handshake and
 * are placed in rooms; rooms decide who receives which request events.
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
    private readonly users: UsersService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const user = await this.authenticate(socket);
    if (!user) {
      socket.emit('error', { code: 'UNAUTHORIZED' });
      socket.disconnect(true);
      return;
    }

    (socket.data as { user?: SocketUser }).user = user;
    await socket.join(userRoom(user.id));
    if (user.role === Role.SUPERVISOR) {
      await socket.join(SUPERVISORS_ROOM);
    }
    this.logger.debug(`Socket ${socket.id} connected for user ${user.id}`);
  }

  handleDisconnect(socket: Socket): void {
    const user = (socket.data as { user?: SocketUser }).user;
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

  private async authenticate(socket: Socket): Promise<SocketUser | null> {
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
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        algorithms: ['HS256'],
      });
      const user = await this.users.findById(payload.sub);
      return user ? { id: user.id, role: user.role } : null;
    } catch {
      return null;
    }
  }
}
