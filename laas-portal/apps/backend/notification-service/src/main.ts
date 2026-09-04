/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = Number(process.env.NOTIFICATION_SERVICE_PORT ?? process.env.PORT ?? 3000);
  const host =
    process.env.NOTIFICATION_SERVICE_HOST ??
    process.env.HOST ??
    process.env.HOSTNAME ??
    '127.0.0.1';

  await app.listen(port, host);
  Logger.log(`Application is running on: http://${host}:${port}/${globalPrefix}`);
}

bootstrap();
