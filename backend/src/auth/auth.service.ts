import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { AppException, ErrorCode } from '../common/errors/app-error';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login.response';
import type { JwtPayload } from './jwt.strategy';

// A bcrypt hash of a random, discarded value, with the same cost as real passwords. Comparing
// against it when the email is unknown makes both failure paths take the same time.
const DUMMY_PASSWORD_HASH =
  '$2b$10$Qkx.ZRou9LWSz1o/JHUo3OIGd5on33t6v5Is.Fm6Ipvax7ZpFUTWK';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.users.findByEmail(dto.email);
    // Same error and the same work for an unknown email and a wrong password, so accounts
    // cannot be enumerated from the message or from the response time.
    const valid = await compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !valid) {
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: this.users.toDto(user),
    };
  }
}
