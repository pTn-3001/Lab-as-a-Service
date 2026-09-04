import { HttpModule } from '@nestjs/axios';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';

import { RequestIdMiddleware } from './common/request-id.middleware';
import { JwtMiddleware } from './auth/jwt.middleware';
import { RbacGuard } from './rbac/rbac.guard';
import { ProxyService } from './proxy/proxy.service';
import { ProxyController } from './proxy/proxy.controller';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/backend/api-gateway/.env',
      validationSchema: envValidationSchema,
      load: [configuration],
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET') ?? 'dev-jwt-secret',
        signOptions: { algorithm: 'HS256' },
      }),
    }),
    HttpModule.registerAsync({
      useFactory: () => ({}),
    }),
  ],
  controllers: [HealthController, ProxyController],
  providers: [JwtMiddleware, RbacGuard, ProxyService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
    consumer.apply(JwtMiddleware).forRoutes('*');
  }
}
