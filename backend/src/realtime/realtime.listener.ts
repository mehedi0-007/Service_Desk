import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SessionEvents } from '../auth/session-events';
import type { SessionsRevokedEvent } from '../auth/session-events';
import { RequestDto } from '../requests/dto/request.response';
import { RequestEvents } from '../requests/request-events';
import type {
  RequestAudience,
  RequestChangedEvent,
  RequestProgressEvent,
} from '../requests/request-events';
import { RealtimeGateway } from './realtime.gateway';

const audienceOf = (request: RequestDto): RequestAudience => ({
  createdById: request.createdBy.id,
  assignedToId: request.assignedTo?.id ?? null,
});

/** Forwards committed domain events to connected clients. Never throws back into the publisher. */
@Injectable()
export class RealtimeListener {
  private readonly logger = new Logger(RealtimeListener.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  @OnEvent(RequestEvents.Created)
  onCreated({ request }: RequestChangedEvent): void {
    this.send(RequestEvents.Created, { request }, audienceOf(request));
  }

  @OnEvent(RequestEvents.Updated)
  onUpdated({ request }: RequestChangedEvent): void {
    this.send(RequestEvents.Updated, { request }, audienceOf(request));
  }

  @OnEvent(RequestEvents.Progress)
  onProgress(event: RequestProgressEvent): void {
    // The audience is for routing only; clients receive the progress delta.
    const { audience, ...payload } = event;
    this.send(RequestEvents.Progress, payload, audience);
  }

  @OnEvent(SessionEvents.Revoked)
  onSessionsRevoked({ sessionIds, reason }: SessionsRevokedEvent): void {
    try {
      this.gateway.disconnectSessions(sessionIds, reason);
    } catch (error) {
      this.logger.warn(`Could not close revoked sessions: ${String(error)}`);
    }
  }

  private send(
    event: string,
    payload: unknown,
    audience: RequestAudience,
  ): void {
    try {
      this.gateway.emitToAudience(event, payload, audience);
    } catch (error) {
      this.logger.warn(`Could not push ${event}: ${String(error)}`);
    }
  }
}
