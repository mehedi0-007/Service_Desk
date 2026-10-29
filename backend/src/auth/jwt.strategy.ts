import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { appConfig } from '../config/app.config';
import type { AppConfig } from '../config/app.config';
import { SessionsService } from './sessions.service';

/** `sid` names the session the token was issued for. */
export type JwtPayload = { sub: string; role: Role; sid: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(appConfig.KEY) config: AppConfig,
    private readonly sessions: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.secret,
      algorithms: ['HS256'],
    });
  }

  // Loads the session with its user in one query: a logout or a removed account takes effect
  // immediately, at the cost of the user lookup that was needed anyway.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser | null> {
    if (!payload.sid) {
      return null;
    }
    const session = await this.sessions.findActive(payload.sid);
    if (!session || session.userId !== payload.sub) {
      return null;
    }
    const { user } = session;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionId: session.id,
    };
  }
}
