import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SeedOnStartService } from './seed-on-start.service';

@Global()
@Module({
  providers: [PrismaService, SeedOnStartService],
  exports: [PrismaService],
})
export class PrismaModule {}
