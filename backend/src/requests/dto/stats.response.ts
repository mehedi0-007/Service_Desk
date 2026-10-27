import { ApiProperty } from '@nestjs/swagger';
import { RequestPriority, RequestStatus } from '@prisma/client';

export class QueueStatsDto {
  @ApiProperty({ description: 'Jobs waiting for a free worker slot' })
  waiting!: number;

  @ApiProperty({ description: 'Jobs being processed right now' })
  active!: number;

  @ApiProperty({ description: 'Maximum jobs processed at the same time' })
  workerConcurrency!: number;
}

export class StatsDto {
  @ApiProperty()
  total!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: {
      QUEUED: 2,
      IN_PROGRESS: 1,
      COMPLETED: 6,
      FAILED: 3,
      CANCELLED: 3,
    },
  })
  byStatus!: Record<RequestStatus, number>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { LOW: 3, MEDIUM: 6, HIGH: 4, URGENT: 2 },
  })
  byPriority!: Record<RequestPriority, number>;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Average time from start to completion of completed requests',
  })
  avgProcessingSeconds!: number | null;

  @ApiProperty({ type: QueueStatsDto })
  queue!: QueueStatsDto;

  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;
}
