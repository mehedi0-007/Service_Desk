import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RequestPriority, RequestStatus } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { appConfig } from '../config/app.config';
import type { AppConfig } from '../config/app.config';
import { RequestQueueService } from '../processing/request-queue.service';
import { StatsDto } from './dto/stats.response';
import { RequestEvents } from './request-events';
import { RequestsRepository } from './requests.repository';

const STATS_KEY = 'stats:v1';

const zeroCounts = <K extends string>(keys: K[]): Record<K, number> =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

/** Cache-aside: served from Redis until a request is created or changes. */
@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly repository: RequestsRepository,
    private readonly queue: RequestQueueService,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
  ) {}

  async getStats(): Promise<StatsDto> {
    const cached = await this.cache.get<StatsDto>(STATS_KEY);
    if (cached) {
      return cached;
    }
    const stats = await this.build();
    await this.cache.set(
      STATS_KEY,
      stats,
      this.config.statsCacheTtlSeconds * 1000,
    );
    return stats;
  }

  // Progress ticks do not change any counter, so they do not invalidate the cache.
  @OnEvent(RequestEvents.Created)
  @OnEvent(RequestEvents.Updated)
  async invalidate(): Promise<void> {
    try {
      await this.cache.del(STATS_KEY);
    } catch (error) {
      this.logger.warn(`Could not invalidate stats cache: ${String(error)}`);
    }
  }

  private async build(): Promise<StatsDto> {
    const [counts, queue] = await Promise.all([
      this.repository.stats(),
      this.queue.getCounts(),
    ]);

    const byStatus = zeroCounts(Object.values(RequestStatus));
    for (const { status, count } of counts.byStatus) {
      byStatus[status] = count;
    }
    const byPriority = zeroCounts(Object.values(RequestPriority));
    for (const { priority, count } of counts.byPriority) {
      byPriority[priority] = count;
    }

    return {
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      byStatus,
      byPriority,
      avgProcessingSeconds: counts.avgProcessingSeconds,
      queue: { ...queue, workerConcurrency: this.config.worker.concurrency },
      generatedAt: new Date().toISOString(),
    };
  }
}
