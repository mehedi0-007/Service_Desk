import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { RequestQueueService } from '../processing/request-queue.service';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    private readonly queue: RequestQueueService,
  ) {}

  async pingCheck(key: string) {
    const indicator = this.indicators.check(key);
    try {
      await this.queue.assertConnected();
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'Redis unavailable',
      });
    }
  }
}
