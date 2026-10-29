import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../../users/dto/user.response';

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ description: 'Seconds until the access token expires' })
  expiresIn!: number;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
