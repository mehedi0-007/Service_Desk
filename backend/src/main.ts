import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';
import { AppConfig, appConfig } from './config/app.config';
import { SocketIoAdapter } from './realtime/socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  const config = app.get<AppConfig>(appConfig.KEY);

  // Behind a hosting proxy, use the client address from X-Forwarded-For for rate limiting.
  app.set('trust proxy', 1);
  app.use(helmet());
  // The frontend is on another origin and sends a Bearer token, so every call needs a CORS
  // preflight; caching it for 10 minutes saves a round trip on nearly every request.
  app.enableCors({
    origin: config.corsOrigins,
    credentials: false,
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
      .build(),
  );
  SwaggerModule.setup('docs', app, document);

  app.enableShutdownHooks();
  await app.listen(config.port);
}
void bootstrap();
