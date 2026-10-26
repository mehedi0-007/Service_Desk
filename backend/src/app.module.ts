import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AppConfig, appConfig } from './config/app.config';
import { envValidationSchema } from './config/env.validation';
import { buildLoggerParams } from './config/logger.config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Joi runs with allowUnknown and abortEarly disabled, so every invalid variable is reported at once.
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: AppConfig) => buildLoggerParams(config),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
  ],
  // Guard order matters: authenticate first, then check roles.
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
