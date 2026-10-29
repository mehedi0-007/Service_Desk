import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeListener } from './realtime.listener';

@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, RealtimeListener],
})
export class RealtimeModule {}
