import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../../users/dto/user.response';

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
