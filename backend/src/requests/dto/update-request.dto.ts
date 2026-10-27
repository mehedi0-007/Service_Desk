import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestPriority } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/** At least one of priority or assignedToId must be present. */
export class UpdateRequestDto {
  @ApiPropertyOptional({ enum: RequestPriority })
  @IsOptional()
  @IsEnum(RequestPriority)
  priority?: RequestPriority;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'A supervisor id, or null to unassign',
  })
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;

  @ApiProperty({ minimum: 1, description: 'The version you last read' })
  @IsInt()
  @Min(1)
  version!: number;
}
