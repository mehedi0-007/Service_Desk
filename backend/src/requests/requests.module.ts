import { Module } from '@nestjs/common';
import { QueueModule } from '../processing/queue.module';
import { UsersModule } from '../users/users.module';
import { RequestEventsPublisher } from './request-events';
import { RequestsController } from './requests.controller';
import { RequestsRepository } from './requests.repository';
import { RequestsService } from './requests.service';
import { StatsService } from './stats.service';

@Module({
  imports: [QueueModule, UsersModule],
  controllers: [RequestsController],
  providers: [
    RequestsService,
    RequestsRepository,
    RequestEventsPublisher,
    StatsService,
  ],
  exports: [RequestsRepository, RequestEventsPublisher],
})
export class RequestsModule {}
