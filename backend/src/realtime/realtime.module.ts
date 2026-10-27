import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeListener } from './realtime.listener';

@Module({
  imports: [AuthModule, UsersModule],
  providers: [RealtimeGateway, RealtimeListener],
})
export class RealtimeModule {}
