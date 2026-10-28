import { NestExpressApplication } from '@nestjs/platform-express';
import { io, Socket } from 'socket.io-client';
import { RequestDto } from '../src/requests/dto/request.response';
import {
  createRequest,
  createTestApp,
  loginAs,
  OPERATOR,
  OPERATOR_2,
  resetData,
  SUPERVISOR,
  waitFor,
} from './utils';

type Received = { event: string; payload: Record<string, unknown> };

describe('Realtime (e2e)', () => {
  let app: NestExpressApplication;
  let url: string;
  let operator: string;
  let operator2: string;
  let supervisor: string;
  const sockets: Socket[] = [];

  /** Connects and records every event the socket receives. */
  async function connect(token?: string) {
    const socket = io(`${url}/realtime`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    const received: Received[] = [];
    socket.onAny((event: string, payload: Record<string, unknown>) =>
      received.push({ event, payload }),
    );
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    return { socket, received };
  }

  beforeAll(async () => {
    app = await createTestApp();
    url = (await app.getUrl()).replace('[::1]', 'localhost');
    [operator, operator2, supervisor] = await Promise.all([
      loginAs(app, OPERATOR),
      loginAs(app, OPERATOR_2),
      loginAs(app, SUPERVISOR),
    ]);
  });

  beforeEach(async () => {
    await resetData(app);
  });

  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a connection without a valid token', async () => {
    for (const token of [undefined, 'not-a-jwt']) {
      const { socket, received } = await connect(token);
      await waitFor(() => Promise.resolve(socket.disconnected));
      expect(received).toContainEqual({
        event: 'error',
        payload: { code: 'UNAUTHORIZED' },
      });
    }
  });

  it("pushes a request's lifecycle to supervisors and its owner only", async () => {
    const sup = await connect(supervisor);
    const owner = await connect(operator);
    const other = await connect(operator2);

    const created = await createRequest(app, operator);
    const isMine = (r: Received) =>
      ((r.payload.request as RequestDto | undefined)?.id ?? r.payload.id) ===
      created.id;
    const completed = (r: Received) =>
      r.event === 'request.updated' &&
      (r.payload.request as RequestDto).status === 'COMPLETED';

    for (const client of [sup, owner]) {
      await waitFor(() => Promise.resolve(client.received.some(completed)));
      const events = client.received.filter(isMine).map((r) => r.event);
      expect(events[0]).toBe('request.created');
      expect(events).toContain('request.progress');
      expect(events.filter((e) => e === 'request.progress')).toHaveLength(12);
    }

    // Progress events carry the delta only, never the routing audience.
    const progress = sup.received.find((r) => r.event === 'request.progress')!;
    expect(Object.keys(progress.payload).sort()).toEqual(
      ['id', 'progress', 'referenceNo', 'stage', 'status', 'updatedAt'].sort(),
    );

    expect(other.received.filter(isMine)).toEqual([]);
  });
});
