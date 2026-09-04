import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { buildRouteMap, ServiceRoute } from '../config/service-map';
import { AuthenticatedRequest } from '../auth/jwt.middleware';

const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

const SKIP_RESPONSE = new Set(['transfer-encoding', 'connection']);

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private readonly routeMap: Record<string, ServiceRoute>;
  private readonly timeoutMs: number;
  private readonly gatewaySecret: string;

  constructor(
    private readonly http: HttpService,
    cfg: ConfigService,
  ) {
    this.routeMap = buildRouteMap(cfg);
    this.timeoutMs = cfg.get<number>('UPSTREAM_TIMEOUT_MS') ?? 300_000;
    this.gatewaySecret = cfg.get<string>('GATEWAY_SHARED_SECRET')!;
  }

  async forward(req: AuthenticatedRequest, res: Response): Promise<void> {
    // Resolve the original request path (originalUrl is never stripped by Express)
    const reqPath = (req.originalUrl ?? req.path).split('?')[0];

    // Segment immediately after /api/
    const segment = reqPath.split('/')[2];
    const route = this.routeMap[segment];
    if (!route) {
      throw new NotFoundException(`No upstream service for segment: "${segment}"`);
    }

    // Apply service-specific path transform (handles /api/v1 prefix insertion, etc.)
    const upstreamPath = route.transformPath(reqPath);

    // Build forwarded headers — strip hop-by-hop headers
    const headers: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) {
        headers[k] = v as string | string[];
      }
    }

    // Strip any spoofed x-user-* that the client may have set
    delete headers['x-user-id'];
    delete headers['x-user-role'];
    delete headers['x-user-email'];
    delete headers['x-user-username'];

    // Re-inject verified identity from JWT middleware
    const user = req.user;
    if (user) {
      headers['x-user-id'] = user.id;
      headers['x-user-role'] = user.role;
      headers['x-user-email'] = user.email;
      if (user.username) headers['x-user-username'] = user.username;
    }

    // Downstream services can verify the request came through the gateway
    headers['x-gateway-secret'] = this.gatewaySecret;
    headers['x-request-id'] = (req as any).requestId ?? '';

    // Reconstruct query string
    const qs = req.originalUrl?.includes('?') ? '?' + req.originalUrl.split('?')[1] : '';
    const targetUrl = `${route.baseUrl}${upstreamPath}${qs}`;

    this.logger.debug(
      `[${(req as any).requestId ?? '-'}] ${req.method} ${reqPath} → ${targetUrl}`,
    );

    const upstream = await firstValueFrom(
      this.http.request({
        method: req.method as any,
        url: targetUrl,
        headers,
        data: ['GET', 'HEAD', 'DELETE'].includes(req.method.toUpperCase())
          ? undefined
          : req.body,
        timeout: this.timeoutMs,
        validateStatus: () => true,
        responseType: 'arraybuffer',
      }),
    );

    // Forward upstream response headers
    for (const [k, v] of Object.entries(upstream.headers)) {
      if (!SKIP_RESPONSE.has(k.toLowerCase()) && v != null) {
        res.setHeader(k, v as string | string[]);
      }
    }

    res.status(upstream.status).send(upstream.data);
  }
}
