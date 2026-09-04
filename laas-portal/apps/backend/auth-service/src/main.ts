/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
  const port = Number(process.env.AUTH_SERVICE_PORT ?? process.env.PORT ?? 3000);
  const host =
    process.env.AUTH_SERVICE_HOST ?? process.env.HOST ?? process.env.HOSTNAME ?? '127.0.0.1';

  await app.listen(port, host);
  Logger.log(`Application is running on: http://${host}:${port}/${globalPrefix}`);
}

bootstrap();
