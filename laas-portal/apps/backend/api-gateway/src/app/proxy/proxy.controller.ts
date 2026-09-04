import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedRequest } from '../auth/jwt.middleware';
import { RbacGuard } from '../rbac/rbac.guard';
import { ProxyService } from './proxy.service';

@Controller()
@UseGuards(RbacGuard)
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}

  // Catch everything under /api/* — health endpoints are on a separate controller
  // and NestJS resolves more-specific routes first, so /health is safe.
  @All('api/*path')
  async proxyAll(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    return this.proxy.forward(req, res);
  }
}
