import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProcessingStage, RequestStatus } from '@prisma/client';
import { RequestDto } from './dto/request.response';

export const RequestEvents = {
  Created: 'request.created',
  Updated: 'request.updated',
  Progress: 'request.progress',
} as const;

export type RequestChangedEvent = { request: RequestDto };

/** Users who may see a request besides supervisors; used to route real-time messages. */
export type RequestAudience = {
  createdById: string;
  assignedToId: string | null;
};

export type RequestProgressEvent = {
  id: string;
  referenceNo: number;
  status: RequestStatus;
  progress: number;
  stage: ProcessingStage | null;
  updatedAt: string;
  audience: RequestAudience;
};

/**
 * Publishes in-process domain events after a change is committed. Producers (API and worker)
 * depend only on this class, never on the consumers (cache invalidation, WebSocket gateway).
 */
@Injectable()
export class RequestEventsPublisher {
  constructor(private readonly events: EventEmitter2) {}

  created(request: RequestDto): void {
    this.events.emit(RequestEvents.Created, {
      request,
    } satisfies RequestChangedEvent);
  }

  updated(request: RequestDto): void {
    this.events.emit(RequestEvents.Updated, {
      request,
    } satisfies RequestChangedEvent);
  }

  progress(event: RequestProgressEvent): void {
    this.events.emit(RequestEvents.Progress, event);
  }
}
