/**
 * Orchestration service entry point.
 *
 * Responsibilities:
 * - boot NestJS runtime
 * - expose all APIs under /api prefix
 * - bind host/port from env with safe local defaults
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Enable CORS for frontend requests
  app.enableCors({
    origin: process.env.CORS_ORIGIN || [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4200',
    ],
    credentials: true,
  });
  // Keep a consistent API base path across all environments.
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = Number(process.env.ORCHESTRATION_SERVICE_PORT ?? process.env.PORT ?? 3000);
  const host = process.env.ORCHESTRATION_SERVICE_HOST ?? process.env.HOST ?? 'localhost';

  await app.listen(port, host);
  Logger.log(`Application is running on: http://${host}:${port}/${globalPrefix}`);
}

bootstrap();
