import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({
    example: 'NewSecret42',
    description:
      '8–72 characters (bcrypt uses at most 72 bytes), at least one letter and one digit',
  })
  @IsString()
  @Length(8, 72)
  @Matches(/[A-Za-z]/, { message: 'newPassword must contain a letter' })
  @Matches(/\d/, { message: 'newPassword must contain a digit' })
  newPassword!: string;
}
