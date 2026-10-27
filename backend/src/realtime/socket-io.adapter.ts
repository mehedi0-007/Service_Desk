import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { IncomingMessage } from 'node:http';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Applies the REST API's origin allow-list to WebSocket connections. The `cors` option only
 * covers HTTP long-polling; browsers do not apply CORS to WebSocket upgrades, so the handshake
 * also rejects browser origins outside the list. Non-browser clients send no Origin header and
 * still need a valid token.
 */
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins },
      allowRequest: (
        request: IncomingMessage,
        callback: (error: string | null, allowed: boolean) => void,
      ) => {
        const origin = request.headers.origin;
        callback(null, !origin || this.corsOrigins.includes(origin));
      },
    }) as Server;
  }
}
