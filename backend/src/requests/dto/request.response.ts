import { ApiProperty } from '@nestjs/swagger';
import {
  ProcessingStage,
  RequestCategory,
  RequestPriority,
  RequestStatus,
} from '@prisma/client';

export class UserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class RequestDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 42, description: 'Displayed as SR-00042' })
  referenceNo!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: RequestCategory })
  category!: RequestCategory;

  @ApiProperty({ enum: RequestPriority })
  priority!: RequestPriority;

  @ApiProperty({ enum: RequestStatus })
  status!: RequestStatus;

  @ApiProperty({ minimum: 0, maximum: 100 })
  progress!: number;

  @ApiProperty({ enum: ProcessingStage, nullable: true })
  stage!: ProcessingStage | null;

  @ApiProperty()
  attempts!: number;

  @ApiProperty({ type: String, nullable: true })
  failureReason!: string | null;

  @ApiProperty({ description: 'Send back on updates for optimistic locking' })
  version!: number;

  @ApiProperty({ type: UserSummaryDto })
  createdBy!: UserSummaryDto;

  @ApiProperty({ type: UserSummaryDto, nullable: true })
  assignedTo!: UserSummaryDto | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: string | null;
}

export class PaginationMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class PaginatedRequestsDto {
  @ApiProperty({ type: RequestDto, isArray: true })
  items!: RequestDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class HistoryEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: RequestStatus, nullable: true })
  fromStatus!: RequestStatus | null;

  @ApiProperty({ enum: RequestStatus })
  toStatus!: RequestStatus;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({
    type: UserSummaryDto,
    nullable: true,
    description: 'null when the change was made by the system',
  })
  changedBy!: UserSummaryDto | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}
