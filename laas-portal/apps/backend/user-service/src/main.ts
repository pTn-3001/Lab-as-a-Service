/**
 * User Service - Lab-as-a-Service (LaaS)
 * Microservice for managing user profiles, roles, and group assignments
 */
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app/app.module';

async function bootstrap() {
  // Create Fastify application
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: process.env.NODE_ENV === 'development',
    })
  );

  // Global prefix
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('User Service API')
    .setDescription(
      'User Service for Lab-as-a-Service (LaaS) - Manages user profiles, roles, and group assignments'
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Users', 'User profile and management endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Start server
  const port = Number(process.env.USER_SERVICE_PORT ?? process.env.PORT ?? 3002);
  const host = process.env.USER_SERVICE_HOST ?? process.env.HOST ?? '0.0.0.0';

  await app.listen(port, host);

  Logger.log(`User Service is running on: http://${host}:${port}/${globalPrefix}`);
  Logger.log(`📚 Swagger documentation: http://${host}:${port}/${globalPrefix}/docs`);
}

bootstrap();
