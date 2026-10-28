import { Logger } from '@nestjs/common';
import {
  ProcessingStage,
  RequestCategory,
  RequestPriority,
  RequestStatus,
} from '@prisma/client';
import { Job } from 'bullmq';
import type { AppConfig } from '../config/app.config';
import { RequestEventsPublisher } from '../requests/request-events';
import { RequestRow } from '../requests/request.mapper';
import { RequestsRepository } from '../requests/requests.repository';
import { ProcessRequestJobData } from './processing.constants';
import { RequestProcessor } from './request.processor';

const inProgress: RequestRow = {
  id: 'request-id',
  referenceNo: 7,
  title: 'Printer jams',
  description: 'The printer on floor 2 jams on every job.',
  category: RequestCategory.HARDWARE,
  priority: RequestPriority.LOW,
  status: RequestStatus.IN_PROGRESS,
  progress: 0,
  stage: ProcessingStage.VALIDATING,
  attempts: 1,
  failureReason: null,
  version: 2,
  queueJobId: 'request-id-v1',
  createdById: 'owner-id',
  assignedToId: null,
  createdBy: { id: 'owner-id', name: 'Olivia Operator' },
  assignedTo: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  startedAt: new Date(),
  finishedAt: null,
};

const job = {
  id: 'request-id-v1',
  data: { requestId: 'request-id' },
} as Job<ProcessRequestJobData>;

describe('RequestProcessor', () => {
  // The failure paths log on purpose; keep the test output readable.
  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  let repository: jest.Mocked<
    Pick<RequestsRepository, 'transition' | 'updateProgress' | 'findById'>
  >;
  let events: jest.Mocked<Pick<RequestEventsPublisher, 'updated' | 'progress'>>;

  const createProcessor = (failureRate = 0) =>
    new RequestProcessor(
      repository as unknown as RequestsRepository,
      events as unknown as RequestEventsPublisher,
      {
        worker: { concurrency: 1, stageMinMs: 0, stageMaxMs: 0, failureRate },
      } as AppConfig,
    );

  const transitionsTo = () =>
    repository.transition.mock.calls.map(([input]) => input.to);

  beforeEach(() => {
    repository = {
      transition: jest.fn().mockResolvedValue(1),
      updateProgress: jest.fn().mockResolvedValue(1),
      findById: jest.fn().mockResolvedValue(inProgress),
    };
    events = { updated: jest.fn(), progress: jest.fn() };
  });

  it('does nothing when another worker or a cancel got there first', async () => {
    repository.transition.mockResolvedValue(0);

    await createProcessor().process(job);

    expect(repository.transition).toHaveBeenCalledTimes(1);
    expect(repository.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        from: RequestStatus.QUEUED,
        to: RequestStatus.IN_PROGRESS,
      }),
    );
    expect(repository.updateProgress).not.toHaveBeenCalled();
    expect(events.updated).not.toHaveBeenCalled();
  });

  it('runs three stages of progress and completes', async () => {
    await createProcessor().process(job);

    const progress = repository.updateProgress.mock.calls.map(
      ([, value, stage]) => [value, stage],
    );
    expect(progress).toHaveLength(12);
    expect(progress[0]).toEqual([8, ProcessingStage.VALIDATING]);
    expect(progress[4]).toEqual([42, ProcessingStage.PROCESSING]);
    // 100 is only written together with COMPLETED.
    expect(progress[11]).toEqual([99, ProcessingStage.FINALIZING]);
    expect(events.progress).toHaveBeenCalledTimes(12);

    expect(transitionsTo()).toEqual([
      RequestStatus.IN_PROGRESS,
      RequestStatus.COMPLETED,
    ]);
    expect(repository.transition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: RequestStatus.IN_PROGRESS,
        actorId: null,
        data: expect.objectContaining({
          progress: 100,
          stage: null,
          queueJobId: null,
        }) as unknown,
      }),
    );
    // Claimed and completed are both published.
    expect(events.updated).toHaveBeenCalledTimes(2);
  });

  it('stops at the next tick once the request is cancelled', async () => {
    repository.updateProgress
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    await createProcessor().process(job);

    expect(repository.updateProgress).toHaveBeenCalledTimes(3);
    expect(events.progress).toHaveBeenCalledTimes(2);
    expect(transitionsTo()).toEqual([RequestStatus.IN_PROGRESS]);
  });

  it('marks the request failed after the processing stage when the failure roll hits', async () => {
    await createProcessor(1).process(job);

    expect(repository.updateProgress).toHaveBeenCalledTimes(8);
    expect(transitionsTo()).toEqual([
      RequestStatus.IN_PROGRESS,
      RequestStatus.FAILED,
    ]);
    expect(repository.transition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: 'Simulated processing error',
        }) as unknown,
      }),
    );
  });

  it('never leaves a claimed request in progress when something throws', async () => {
    repository.updateProgress.mockRejectedValueOnce(
      new Error('connection reset'),
    );

    await createProcessor().process(job);

    expect(transitionsTo()).toEqual([
      RequestStatus.IN_PROGRESS,
      RequestStatus.FAILED,
    ]);
    expect(repository.transition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: 'Unexpected processing error',
        }) as unknown,
      }),
    );
  });
});
