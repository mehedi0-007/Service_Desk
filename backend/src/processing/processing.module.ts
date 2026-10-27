import { Module } from '@nestjs/common';
import { RequestsModule } from '../requests/requests.module';
import { QueueModule } from './queue.module';
import { RequestProcessor } from './request.processor';

@Module({
  imports: [QueueModule, RequestsModule],
  providers: [RequestProcessor],
})
export class ProcessingModule {}
