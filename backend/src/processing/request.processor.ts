import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma, ProcessingStage, RequestStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { randomInt } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { appConfig } from '../config/app.config';
import type { AppConfig } from '../config/app.config';
import { RequestDto } from '../requests/dto/request.response';
import { RequestEventsPublisher } from '../requests/request-events';
import { toRequestDto } from '../requests/request.mapper';
import { RequestsRepository } from '../requests/requests.repository';
import { ProcessRequestJobData, REQUEST_QUEUE } from './processing.constants';

const STAGES: readonly ProcessingStage[] = [
  ProcessingStage.VALIDATING,
  ProcessingStage.PROCESSING,
  ProcessingStage.FINALIZING,
];
const TICKS_PER_STAGE = 4;
const TOTAL_TICKS = STAGES.length * TICKS_PER_STAGE;

const formatRef = (referenceNo: number): string =>
  `SR-${String(referenceNo).padStart(5, '0')}`;

/**
 * Processes queued requests through simulated stages. Several jobs run at the same time
 * (WORKER_CONCURRENCY) in the API process: the work is timer and I/O bound, so it never blocks
 * the event loop and HTTP requests stay responsive.
 *
 * The database is the source of truth. Every write is guarded by the expected status, so a
 * request is claimed by exactly one worker, and a user's cancel always wins over the worker.
 */
@Processor(REQUEST_QUEUE)
export class RequestProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(RequestProcessor.name);

  constructor(
    private readonly repository: RequestsRepository,
    private readonly events: RequestEventsPublisher,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.worker.concurrency;
    this.logger.log(
      `Worker started with concurrency ${this.config.worker.concurrency}`,
    );
  }

  async process(job: Job<ProcessRequestJobData>): Promise<void> {
    const { requestId } = job.data;
    const startedAt = Date.now();

    const claimed = await this.repository.transition({
      id: requestId,
      from: RequestStatus.QUEUED,
      to: RequestStatus.IN_PROGRESS,
      actorId: null,
      data: {
        attempts: { increment: 1 },
        startedAt: new Date(),
        finishedAt: null,
        progress: 0,
        stage: ProcessingStage.VALIDATING,
      },
      note: 'Processing started',
    });
    if (claimed === 0) {
      this.logger.debug(`Job ${job.id} skipped: request is no longer queued`);
      return;
    }

    // From here on the request is IN_PROGRESS: every error must end in a final status,
    // otherwise the request would stay in progress until the next restart.
    let label = requestId;
    try {
      const request = await this.publishUpdated(requestId);
      label = formatRef(request.referenceNo);
      this.logger.log(`${label} claimed by job ${job.id}`);

      const outcome = await this.runStages(request);
      if (outcome === 'cancelled') {
        this.logger.log(`${label} stopped: cancelled`);
        return;
      }
      if (outcome === 'failed') {
        await this.finish(requestId, label, startedAt, RequestStatus.FAILED, {
          failureReason: 'Simulated processing error',
        });
        return;
      }
      await this.finish(requestId, label, startedAt, RequestStatus.COMPLETED, {
        progress: 100,
        stage: null,
      });
    } catch (error) {
      // The job itself does not fail in BullMQ: the request row records the outcome.
      this.logger.error(
        `${label} failed unexpectedly`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.finish(requestId, label, startedAt, RequestStatus.FAILED, {
        failureReason: 'Unexpected processing error',
      }).catch((finishError: unknown) =>
        this.logger.error(`${label} could not be marked failed`, finishError),
      );
    }
  }

  private async runStages(
    request: RequestDto,
  ): Promise<'completed' | 'failed' | 'cancelled'> {
    const { stageMinMs, stageMaxMs, failureRate } = this.config.worker;
    const audience = {
      createdById: request.createdBy.id,
      assignedToId: request.assignedTo?.id ?? null,
    };

    for (const [index, stage] of STAGES.entries()) {
      const tickMs = randomInt(stageMinMs, stageMaxMs + 1) / TICKS_PER_STAGE;
      for (let tick = 1; tick <= TICKS_PER_STAGE; tick++) {
        await sleep(tickMs);
        // 100 is written only together with COMPLETED.
        const progress = Math.min(
          99,
          Math.round(((index * TICKS_PER_STAGE + tick) / TOTAL_TICKS) * 100),
        );
        const written = await this.repository.updateProgress(
          request.id,
          progress,
          stage,
        );
        if (written === 0) {
          // Cooperative cancellation: the request left IN_PROGRESS, so stop at this tick.
          return 'cancelled';
        }
        this.events.progress({
          id: request.id,
          referenceNo: request.referenceNo,
          status: RequestStatus.IN_PROGRESS,
          progress,
          stage,
          updatedAt: new Date().toISOString(),
          audience,
        });
      }
      if (stage === ProcessingStage.PROCESSING && Math.random() < failureRate) {
        return 'failed';
      }
    }
    return 'completed';
  }

  private async finish(
    id: string,
    label: string,
    startedAt: number,
    to: RequestStatus,
    data: Prisma.ServiceRequestUpdateManyMutationInput,
  ): Promise<void> {
    const finished = await this.repository.transition({
      id,
      from: RequestStatus.IN_PROGRESS,
      to,
      actorId: null,
      data: { ...data, finishedAt: new Date(), queueJobId: null },
      note:
        to === RequestStatus.COMPLETED
          ? 'Processing completed'
          : 'Processing failed',
    });
    if (finished === 0) {
      // Cancelled between the last tick and now: the user's cancel wins.
      this.logger.log(`${label} stopped: cancelled`);
      return;
    }
    await this.publishUpdated(id);
    this.logger.log(`${label} ${to} in ${Date.now() - startedAt} ms`);
  }

  private async publishUpdated(id: string): Promise<RequestDto> {
    const row = await this.repository.findById(id);
    if (!row) {
      throw new Error(`Request ${id} disappeared during processing`);
    }
    const request = toRequestDto(row);
    this.events.updated(request);
    return request;
  }
}
