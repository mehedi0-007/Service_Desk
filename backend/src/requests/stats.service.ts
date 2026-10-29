import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
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
export class StatsService implements OnModuleDestroy {
  private readonly logger = new Logger(StatsService.name);
  /**
   * Bumped on every invalidation. A build that started before a change must not write its
   * (older) numbers back into the cache after the change deleted the key.
   */
  private generation = 0;
  /**
   * Set when the application shuts down. Nest closes global modules (the cache) before the
   * processing module, so a job that finishes meanwhile would make the cache store reconnect
   * and keep the process alive.
   */
  private closing = false;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly repository: RequestsRepository,
    private readonly queue: RequestQueueService,
    @Inject(appConfig.KEY) private readonly config: AppConfig,
  ) {}

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    // Closes a connection reopened since the cache module shut down.
    await this.cache.disconnect().catch(() => undefined);
  }

  async getStats(): Promise<StatsDto> {
    if (this.closing) {
      return this.build();
    }
    // Captured before any await, so a change during the cache read also counts.
    const generation = this.generation;
    const cached = await this.cache.get<StatsDto>(STATS_KEY);
    if (cached) {
      return cached;
    }
    const stats = await this.build();
    // Partial results (queue unreachable) are not cached, so recovery shows up immediately.
    if (stats.queue.waiting !== null && generation === this.generation) {
      await this.cache.set(
        STATS_KEY,
        stats,
        this.config.statsCacheTtlSeconds * 1000,
      );
    }
    return stats;
  }

  // Progress ticks do not change any counter, so they do not invalidate the cache.
  @OnEvent(RequestEvents.Created)
  @OnEvent(RequestEvents.Updated)
  async invalidate(): Promise<void> {
    this.generation++;
    if (this.closing) {
      return;
    }
    try {
      await this.cache.del(STATS_KEY);
    } catch (error) {
      this.logger.warn(`Could not invalidate stats cache: ${String(error)}`);
    }
  }

  private async build(): Promise<StatsDto> {
    const [counts, queue] = await Promise.all([
      this.repository.stats(),
      this.queueCounts(),
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

  // Request counts come from the database, so the dashboard keeps working while Redis is down.
  private async queueCounts(): Promise<{
    waiting: number | null;
    active: number | null;
  }> {
    try {
      return await this.queue.getCounts();
    } catch (error) {
      this.logger.warn(`Queue counts unavailable: ${String(error)}`);
      return { waiting: null, active: null };
    }
  }
}
