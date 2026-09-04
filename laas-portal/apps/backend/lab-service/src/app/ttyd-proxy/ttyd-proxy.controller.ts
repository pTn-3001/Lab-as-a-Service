import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TtydProxyService } from './ttyd-proxy.service';

// HTTP proxy for ttyd static assets (HTML, JS, CSS).
// WebSocket connections (/ws) are handled at the HTTP-server upgrade level in main.ts.
//
// Nginx routes /ttyd-proxy/* → http://lab-service:3003/api/v1/ttyd-proxy/*
//
// Two URL structures:
//   Image-builder:  /ttyd-proxy/<sessionId>/<subPath>
//   Lab session:    /ttyd-proxy/<sessionId>/<vmName>/<subPath>
//
// Routing logic: try image-builder session first; if not found, treat second
// segment as vmName and look up lab session vmTerminals.
@Controller('ttyd-proxy')
export class TtydProxyController {
  constructor(private readonly service: TtydProxyService) {}

  @Get('*path')
  async proxyAsset(@Req() req: Request, @Res() res: Response): Promise<void> {
    const fullPath = (req.originalUrl ?? req.url ?? '').split('?')[0];
    const PREFIX = '/api/v1/ttyd-proxy/';
    const ttydRelPath = fullPath.startsWith(PREFIX) ? fullPath.slice(PREFIX.length) : fullPath.replace(/^\/+/, '');
    // ttydRelPath examples:
    //   image-builder: "abc123/"  or  "abc123/js/ttyd.js"
    //   lab session:   "def456/node1/"  or  "def456/node1/js/ttyd.js"

    const segments = ttydRelPath.split('/').filter(Boolean);
    const sessionId = segments[0];

    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId in ttyd-proxy URL' });
      return;
    }

    // Try image-builder session first (covers direct-IP mode too).
    const sshHost = await this.service.getSshHost(sessionId);
    if (sshHost) {
      const subPath = segments.slice(1).join('/');
      await this.proxyHttp(res, sshHost, 7681, subPath);
      return;
    }

    // Fall back to lab session multi-VM: second segment is vmName.
    const vmName = segments[1];
    if (!vmName) {
      res.status(503).send('Session not ready — no sshHost and no vmName in URL');
      return;
    }

    const target = await this.service.getLabVmTarget(sessionId, vmName);
    if (!target) {
      res.status(503).send('Session not ready — vmTerminals not yet assigned or vmName not found');
      return;
    }

    const subPath = segments.slice(2).join('/');
    await this.proxyHttp(res, target.host, target.port, subPath);
  }

  private async proxyHttp(res: Response, host: string, port: number, subPath: string): Promise<void> {
    const targetUrl = `http://${host}:${port}/${subPath}`;
    const maxAttempts = 4;
    const retryDelayMs = 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const upstream = await fetch(targetUrl, {
          method: 'GET',
          headers: { host: `${host}:${port}` },
          redirect: 'follow',
          signal: AbortSignal.timeout(2500),
        });

        const body = Buffer.from(await upstream.arrayBuffer());

        res.status(upstream.status);

        const STRIP_HEADERS = new Set([
          'content-encoding',
          'transfer-encoding',
          'content-length',
          'connection',
          'x-frame-options',
          'content-security-policy',
          'content-security-policy-report-only',
          'x-content-type-options',
        ]);
        upstream.headers.forEach((value: string, key: string) => {
          if (!STRIP_HEADERS.has(key.toLowerCase())) {
            res.setHeader(key, value);
          }
        });
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Length', body.length);
        res.end(body);
        return;
      } catch (err: unknown) {
        if (attempt === maxAttempts) {
          const msg = err instanceof Error ? err.message : String(err);
          res.status(502).json({ error: `ttyd proxy fetch error: ${msg}` });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
}
