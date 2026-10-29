import { Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import type { AppConfig } from '../config/app.config';
import { RequestQueueService } from '../processing/request-queue.service';
import { RequestCounts, RequestsRepository } from './requests.repository';
import { StatsService } from './stats.service';

const COUNTS: RequestCounts = {
  byStatus: [
    { status: 'QUEUED', count: 2 },
    { status: 'COMPLETED', count: 5 },
  ],
  byPriority: [{ priority: 'HIGH', count: 7 }],
  avgProcessingSeconds: 9,
};

describe('StatsService', () => {
  let cache: jest.Mocked<Pick<Cache, 'get' | 'set' | 'del' | 'disconnect'>>;
  let repository: jest.Mocked<Pick<RequestsRepository, 'stats'>>;
  let queue: jest.Mocked<Pick<RequestQueueService, 'getCounts'>>;
  let service: StatsService;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    repository = { stats: jest.fn().mockResolvedValue(COUNTS) };
    queue = {
      getCounts: jest.fn().mockResolvedValue({ waiting: 1, active: 2 }),
    };
    service = new StatsService(
      cache as unknown as Cache,
      repository as unknown as RequestsRepository,
      queue as unknown as RequestQueueService,
      {
        statsCacheTtlSeconds: 15,
        worker: { concurrency: 4 },
      } as AppConfig,
    );
  });

  it('builds complete counts and caches them', async () => {
    const stats = await service.getStats();

    expect(stats).toMatchObject({
      total: 7,
      byStatus: {
        QUEUED: 2,
        IN_PROGRESS: 0,
        COMPLETED: 5,
        FAILED: 0,
        CANCELLED: 0,
      },
      byPriority: { LOW: 0, MEDIUM: 0, HIGH: 7, URGENT: 0 },
      avgProcessingSeconds: 9,
      queue: { waiting: 1, active: 2, workerConcurrency: 4 },
    });
    expect(cache.set).toHaveBeenCalledWith('stats:v1', stats, 15_000);
  });

  it('serves a cached value without querying', async () => {
    const cached = { total: 3 };
    cache.get.mockResolvedValue(cached);

    await expect(service.getStats()).resolves.toBe(cached);
    expect(repository.stats).not.toHaveBeenCalled();
  });

  it('does not cache numbers built before a change that arrived meanwhile', async () => {
    let release!: (counts: RequestCounts) => void;
    repository.stats.mockReturnValue(
      new Promise((resolve) => (release = resolve)),
    );

    const pending = service.getStats();
    // A request changes while the counts are still being read.
    await service.invalidate();
    release(COUNTS);
    await pending;

    expect(cache.del).toHaveBeenCalledWith('stats:v1');
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('keeps the dashboard working without the queue, uncached', async () => {
    queue.getCounts.mockRejectedValue(new Error('Redis is not connected'));

    const stats = await service.getStats();

    expect(stats.total).toBe(7);
    expect(stats.queue).toEqual({
      waiting: null,
      active: null,
      workerConcurrency: 4,
    });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('stops using Redis once the application shuts down', async () => {
    await service.onModuleDestroy();
    // Closes a connection the cache store may have reopened after its own shutdown.
    expect(cache.disconnect).toHaveBeenCalled();

    // A job that finishes during shutdown must not reconnect the cache.
    await service.invalidate();
    const stats = await service.getStats();

    expect(stats.total).toBe(7);
    expect(cache.del).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
