import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'operator1@demo.test' })
  email!: string;

  @ApiProperty({ example: 'Olivia Operator' })
  name!: string;

  @ApiProperty({ enum: Role })
  role!: Role;
}
