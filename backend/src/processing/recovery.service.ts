import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { RequestEventsPublisher } from '../requests/request-events';
import { toRequestDto } from '../requests/request.mapper';
import { RequestsRepository } from '../requests/requests.repository';
import { RequestQueueService } from './request-queue.service';

/**
 * Brings the queue back in line with the database after a restart or crash:
 * - IN_PROGRESS requests were interrupted mid-run (this deployment runs a single instance),
 *   so they go back to QUEUED and are processed again from the start.
 * - QUEUED requests without a pending job are re-enqueued: enqueue failed, Redis lost data,
 *   or the job failed before it could claim the request (for example, the database was down).
 * Safe while the worker is already polling: claiming a request is atomic, and enqueueing
 * reuses the same job id for the same request version.
 */
@Injectable()
export class RecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecoveryService.name);

  constructor(
    private readonly repository: RequestsRepository,
    private readonly queue: RequestQueueService,
    private readonly events: RequestEventsPublisher,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const requeued = await this.requeueInterrupted();
      const reenqueued = await this.enqueueMissingJobs();
      this.logger.log(
        `Recovery: requeued ${requeued} in-progress, re-enqueued ${reenqueued} queued`,
      );
    } catch (error) {
      // Startup continues; anything missed is picked up on the next start.
      this.logger.error(
        'Recovery failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async requeueInterrupted(): Promise<number> {
    const interrupted = await this.repository.findByStatus([
      RequestStatus.IN_PROGRESS,
    ]);
    let count = 0;
    for (const request of interrupted) {
      const moved = await this.repository.transition({
        id: request.id,
        from: RequestStatus.IN_PROGRESS,
        to: RequestStatus.QUEUED,
        actorId: null,
        data: { progress: 0, stage: null },
        note: 'Recovered after service restart',
      });
      if (moved === 0) {
        continue;
      }
      const row = await this.repository.findById(request.id);
      if (row) {
        await this.enqueue(row.id, row.version);
        this.events.updated(toRequestDto(row));
        count++;
      }
    }
    return count;
  }

  private async enqueueMissingJobs(): Promise<number> {
    const queued = await this.repository.findByStatus([RequestStatus.QUEUED]);
    let count = 0;
    for (const request of queued) {
      const pending =
        request.queueJobId !== null &&
        (await this.queue.isPending(request.queueJobId));
      if (!pending) {
        await this.enqueue(request.id, request.version);
        count++;
      }
    }
    return count;
  }

  private async enqueue(id: string, version: number): Promise<void> {
    const jobId = await this.queue.enqueue(id, version);
    await this.repository.setQueueJobId(id, jobId);
  }
}
