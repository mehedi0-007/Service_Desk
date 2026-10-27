import { Module } from '@nestjs/common';
import { QueueModule } from '../processing/queue.module';
import { UsersModule } from '../users/users.module';
import { RequestsController } from './requests.controller';
import { RequestsRepository } from './requests.repository';
import { RequestsService } from './requests.service';

@Module({
  imports: [QueueModule, UsersModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestsRepository],
  exports: [RequestsRepository],
})
export class RequestsModule {}
