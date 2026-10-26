import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig, appConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(appConfig.KEY);
  await app.listen(config.port);
}
void bootstrap();
