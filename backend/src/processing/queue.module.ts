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
      // Failed processing is recorded on the request and retried by a supervisor. BullMQ only
      // retries infrastructure errors that happen before the job claims its request.
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }),
  ],
  providers: [RequestQueueService],
  exports: [BullModule, RequestQueueService],
})
export class QueueModule {}
