/**
 * Grading Service - Lab-as-a-Service (LaaS)
 * Microservice for managing lab grades, checkpoint snapshots, and scores
 */
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix — matches pass-through routing at gateway
  app.setGlobalPrefix('api');

  // Enable CORS
  app.enableCors({ origin: '*' });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Grading Service API')
    .setDescription('API for managing lab grades and checkpoint snapshots')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.GRADING_SERVICE_PORT ?? process.env.PORT ?? 3005);
  const host = process.env.GRADING_SERVICE_HOST ?? process.env.HOST ?? '127.0.0.1';

  await app.listen(port, host);
  Logger.log(`Grading Service running on: http://${host}:${port}/api`);
  Logger.log(`Swagger docs: http://${host}:${port}/api/docs`);
}

bootstrap();
