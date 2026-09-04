import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(private readonly cfg: ConfigService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  readiness() {
    const required = [
      'AUTH_SERVICE_URL',
      'USER_SERVICE_URL',
      'LAB_SERVICE_URL',
      'ORCHESTRATION_SERVICE_URL',
      'JWT_SECRET',
      'GATEWAY_SHARED_SECRET',
    ];

    const missing = required.filter((k) => !this.cfg.get(k));
    if (missing.length) {
      throw { statusCode: 503, message: `Missing config: ${missing.join(', ')}` };
    }

    return { status: 'ready', uptime: process.uptime() };
  }
}
