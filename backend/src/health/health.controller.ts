import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorFunction,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly checks: HealthIndicatorFunction[];

  constructor(
    private readonly health: HealthCheckService,
    prismaHealth: PrismaHealthIndicator,
    prisma: PrismaService,
  ) {
    this.checks = [() => prismaHealth.pingCheck('database', prisma)];
  }

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Service and dependency health' })
  check() {
    return this.health.check(this.checks);
  }
}
