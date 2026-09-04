import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { HttpExceptionFilter } from './app/common/http-exception.filter';
import { LoggingInterceptor } from './app/common/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // CORS
  const corsOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:3000';
  app.enableCors({ origin: corsOrigin.split(',').map((s) => s.trim()), credentials: true });

  // Global error format + request logging
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = parseInt(process.env['PORT'] ?? '3000', 10);
  const host = process.env['HOST'] ?? '127.0.0.1';

  await app.listen(port, host);
  Logger.log(`API Gateway running on http://${host}:${port}`);
}

bootstrap();
