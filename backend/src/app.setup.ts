import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { REFRESH_COOKIE } from './auth/refresh-cookie';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';
import { AppConfig, appConfig } from './config/app.config';
import { SocketIoAdapter } from './realtime/socket-io.adapter';

/**
 * Everything applied to the Nest application around the module graph. Shared by the bootstrap
 * and the end-to-end tests, so the tests run the same middleware, pipes and filters.
 */
export function configureApp(app: NestExpressApplication): AppConfig {
  app.useLogger(app.get(Logger));
  const config = app.get<AppConfig>(appConfig.KEY);

  // Behind a hosting proxy, use the client address from X-Forwarded-For for rate limiting.
  app.set('trust proxy', 1);
  app.use(helmet());
  // Only the auth routes read cookies (the refresh token).
  app.use(cookieParser());
  // The frontend is on another origin and sends a Bearer token, so every call needs a CORS
  // preflight; caching it for 10 minutes saves a round trip on nearly every request.
  // Credentials are allowed so the browser sends and stores the refresh cookie.
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    maxAge: 600,
  });
  app.useWebSocketAdapter(new SocketIoAdapter(app, config.corsOrigins));
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Service Desk API')
      .setDescription(
        'REST API for submitting and monitoring service requests in real time',
      )
      .setVersion('1.0')
      .addBearerAuth()
      // The refresh, logout and login routes use the httpOnly refresh cookie.
      .addCookieAuth(
        REFRESH_COOKIE,
        { type: 'apiKey', in: 'cookie', name: REFRESH_COOKIE },
        REFRESH_COOKIE,
      )
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  app.enableShutdownHooks();
  return config;
}
