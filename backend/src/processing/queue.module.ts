import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfig, appConfig } from '../config/app.config';
import { redisConnectionFromUrl } from '../config/redis-connection';
import { REQUEST_QUEUE } from './processing.constants';
import { RequestQueueService } from './request-queue.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => ({
        connection: redisConnectionFromUrl(config.redisUrl),
      }),
    }),
    BullModule.registerQueue({
      name: REQUEST_QUEUE,
      // Retrying is a supervisor decision, so failed jobs are never retried automatically.
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }),
  ],
  providers: [RequestQueueService],
  exports: [BullModule, RequestQueueService],
})
export class QueueModule {}
