import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequestCategory, RequestPriority } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { Trim } from '../../common/validation/transforms';

export class CreateRequestDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 120,
    example: 'Laptop does not boot',
  })
  @Trim()
  @IsString()
  @Length(3, 120)
  title!: string;

  @ApiProperty({
    minLength: 10,
    maxLength: 2000,
    example:
      'The laptop shows a black screen after the logo since this morning.',
  })
  @Trim()
  @IsString()
  @Length(10, 2000)
  description!: string;

  @ApiProperty({ enum: RequestCategory })
  @IsEnum(RequestCategory)
  category!: RequestCategory;

  @ApiPropertyOptional({
    enum: RequestPriority,
    default: RequestPriority.MEDIUM,
  })
  @IsOptional()
  @IsEnum(RequestPriority)
  priority?: RequestPriority;
}
