import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

import { AppModule } from './app/app.module';
import { TtydProxyService } from './app/ttyd-proxy/ttyd-proxy.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Enable CORS to allow frontend to call APIs in different environments without issues
  app.enableCors();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Lab Service API')
    .setDescription('API for managing Lab Templates, Modules, Validation, Render and Artifacts')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.LAB_SERVICE_PORT ?? process.env.PORT ?? 3003);
  const host =
    process.env.LAB_SERVICE_HOST ?? process.env.HOST ?? process.env.HOSTNAME ?? '127.0.0.1';

  await app.listen(port, host);
  Logger.log(`Lab Service running on: http://${host}:${port}/api/v1`);
  Logger.log(`Swagger docs:           http://${host}:${port}/api/docs`);

  // Hook WebSocket upgrade events for the ttyd terminal proxy.
  // Nginx routes /ttyd-proxy/* directly to this service (bypassing the API gateway),
  // so we handle the HTTP → WebSocket upgrade here rather than in the gateway.
  const ttydProxy = app.get(TtydProxyService);
  const httpServer = app.getHttpServer();
  httpServer.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    ttydProxy.handleUpgrade(req, socket, head);
  });
  Logger.log('ttyd WebSocket proxy registered on HTTP upgrade event');
}

bootstrap();
