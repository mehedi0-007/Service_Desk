import { Module } from '@nestjs/common';
import { RequestsModule } from '../requests/requests.module';
import { QueueModule } from './queue.module';
import { RecoveryService } from './recovery.service';
import { RequestProcessor } from './request.processor';

@Module({
  imports: [QueueModule, RequestsModule],
  providers: [RequestProcessor, RecoveryService],
})
export class ProcessingModule {}
