import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { appConfig } from '../config/app.config';
import type { AppConfig } from '../config/app.config';
import { UsersService } from '../users/users.service';

export type JwtPayload = { sub: string; role: Role };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(appConfig.KEY) config: AppConfig,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.secret,
      algorithms: ['HS256'],
    });
  }

  // Reloading the user means a removed account loses access immediately.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser | null> {
    const user = await this.users.findById(payload.sub);
    return user
      ? { id: user.id, email: user.email, name: user.name, role: user.role }
      : null;
  }
}
