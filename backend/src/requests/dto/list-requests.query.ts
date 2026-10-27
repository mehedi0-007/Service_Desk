import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  RequestCategory,
  RequestPriority,
  RequestStatus,
} from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQuery } from '../../common/dto/pagination.dto';
import { CommaSeparated, Trim } from '../../common/validation/transforms';
import type { RequestSortField } from '../requests.repository';

export const UNASSIGNED = 'unassigned';

const SORT_FIELDS: RequestSortField[] = [
  'createdAt',
  'updatedAt',
  'priority',
  'referenceNo',
];

export class ListRequestsQuery extends PaginationQuery {
  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Searches title and description; "SR-42" or "42" also matches the reference number',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    description: `Comma-separated: ${Object.values(RequestStatus).join(', ')}`,
    example: 'QUEUED,IN_PROGRESS',
  })
  @IsOptional()
  @CommaSeparated()
  @IsEnum(RequestStatus, { each: true })
  status?: RequestStatus[];

  @ApiPropertyOptional({
    description: `Comma-separated: ${Object.values(RequestPriority).join(', ')}`,
    example: 'HIGH,URGENT',
  })
  @IsOptional()
  @CommaSeparated()
  @IsEnum(RequestPriority, { each: true })
  priority?: RequestPriority[];

  @ApiPropertyOptional({ enum: RequestCategory })
  @IsOptional()
  @IsEnum(RequestCategory)
  category?: RequestCategory;

  @ApiPropertyOptional({
    description: `Supervisor id or "${UNASSIGNED}" (supervisors only)`,
  })
  @IsOptional()
  @ValidateIf((query: ListRequestsQuery) => query.assignedToId !== UNASSIGNED)
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Supervisors only',
  })
  @IsOptional()
  @IsUUID()
  createdById?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Inclusive ISO date or date-time',
  })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Inclusive; a date without time covers the whole day (UTC)',
  })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({ enum: SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(SORT_FIELDS)
  sortBy: RequestSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
