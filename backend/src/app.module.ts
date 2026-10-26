import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './config/app.config';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    // Joi runs with allowUnknown and abortEarly disabled, so every invalid variable is reported at once.
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validationSchema: envValidationSchema,
    }),
  ],
})
export class AppModule {}
