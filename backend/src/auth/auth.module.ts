import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { appConfig } from '../config/app.config';
import type { AppConfig } from '../config/app.config';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CookieOriginGuard } from './cookie-origin.guard';
import { JwtStrategy } from './jwt.strategy';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => ({
        secret: config.jwt.secret,
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.jwt.accessTokenTtlSeconds,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    SessionsRepository,
    SessionsService,
    CookieOriginGuard,
  ],
  exports: [JwtModule, SessionsService],
})
export class AuthModule {}
