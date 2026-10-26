import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from './app.config';

const REQUEST_ID_HEADER = 'x-request-id';

export function buildLoggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      // Reuse the caller's request id when present so logs can be correlated across services.
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const header = req.headers[REQUEST_ID_HEADER];
        const id = (Array.isArray(header) ? header[0] : header) || randomUUID();
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      redact: ['req.headers.authorization', 'req.body.password'],
      autoLogging: {
        ignore: (req: IncomingMessage) =>
          req.url?.startsWith('/api/v1/health') ?? false,
      },
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
  };
}
