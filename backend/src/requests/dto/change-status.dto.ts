import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '@prisma/client';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../common/validation/transforms';

// Other statuses are set only by the background processor.
export const USER_TARGET_STATUSES = [
  RequestStatus.QUEUED,
  RequestStatus.CANCELLED,
] as const;

export type UserTargetStatus = (typeof USER_TARGET_STATUSES)[number];

export class ChangeStatusDto {
  @ApiProperty({
    enum: USER_TARGET_STATUSES,
    description:
      'CANCELLED to cancel, QUEUED to retry a failed or cancelled request',
  })
  @IsIn(USER_TARGET_STATUSES)
  status!: UserTargetStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ minimum: 1, description: 'The version you last read' })
  @IsInt()
  @Min(1)
  version!: number;
}
