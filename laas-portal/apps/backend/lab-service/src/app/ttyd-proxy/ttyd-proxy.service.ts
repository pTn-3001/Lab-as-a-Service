import { Injectable, Logger } from '@nestjs/common';
import { request as httpRequest } from 'http';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { PrismaService } from '../prisma/prisma.service';

type VmTerminalEntry = { vmName: string; floatingIp: string; ttydPort: number };

@Injectable()
export class TtydProxyService {
  private readonly logger = new Logger(TtydProxyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Returns the SSH host for image-builder sessions (direct IP or DB lookup).
  async getSshHost(sessionId: string): Promise<string | null> {
    // Direct-IP mode: student lab pages pass the VM's IPv4 address as the "sessionId".
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(sessionId)) {
      return sessionId;
    }
    const session = await this.prisma.imageBuildSession.findUnique({
      where: { id: sessionId },
      select: { sshHost: true },
    });
    return session?.sshHost ?? null;
  }

  // Returns {host, port} for a specific VM in a LabSession (multi-VM NAT mode or direct IP mode).
  async getLabVmTarget(sessionId: string, vmName: string): Promise<{ host: string; port: number } | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const session = await this.prisma.labSession.findUnique({
        where: { id: sessionId },
        select: { vmTerminals: true },
      });

      if (session?.vmTerminals) {
        const terminals = session.vmTerminals as VmTerminalEntry[];
        if (Array.isArray(terminals) && terminals.length > 0) {
          const decodedVmName = decodeURIComponent(vmName).toLowerCase().trim();

          const entry = terminals.find((t) => {
            const tName = (t.vmName || '').toLowerCase().trim();
            return tName === decodedVmName || tName.includes(decodedVmName) || decodedVmName.includes(tName);
          });

          if (entry?.floatingIp && entry.ttydPort) {
            return { host: entry.floatingIp, port: entry.ttydPort };
          }

          if (terminals.length === 1 && terminals[0]?.floatingIp && terminals[0]?.ttydPort) {
            return { host: terminals[0].floatingIp, port: terminals[0].ttydPort };
          }
        }
      }

      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    return null;
  }

  // Called from main.ts for each HTTP upgrade event.
  // Handles two URL patterns:
  //   1. Lab session (multi-VM):  /api/v1/ttyd-proxy/<sessionId>/<vmName>/ws
  //   2. Image-builder (single):  /api/v1/ttyd-proxy/<sessionId>/ws
  handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    const url = req.url ?? '';

    // Pattern 1: lab session — /ttyd-proxy/<sessionId>/<vmName>/ws
    const labMatch = url.match(/\/ttyd-proxy\/([^/?]+)\/([^/?]+)\/ws(?:[?#]|$)/);
    if (labMatch) {
      const [, sessionId, vmName] = labMatch;
      this.getLabVmTarget(sessionId, vmName)
        .then(async (target) => {
          if (!target) {
            // Retry with longer delay — orchestration callback may still be in-flight
            for (let retry = 0; retry < 3; retry++) {
              await new Promise((r) => setTimeout(r, 2000));
              const retryTarget = await this.getLabVmTarget(sessionId, vmName);
              if (retryTarget) {
                this.proxyWebSocket(socket, head, retryTarget.host, retryTarget.port, req);
                return;
              }
            }
            this.logger.warn(`[TtydProxy] No vmTerminal for session=${sessionId} vm=${vmName} after retries`);
            socket.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n');
            return;
          }
          this.proxyWebSocket(socket, head, target.host, target.port, req);
        })
        .catch((err: Error) => {
          this.logger.error(`[TtydProxy] DB lookup failed for session ${sessionId} vm ${vmName}: ${err.message}`);
          socket.end('HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n');
        });
      return;
    }

    // Pattern 2: image-builder — /ttyd-proxy/<sessionId>/ws
    const ibMatch = url.match(/\/ttyd-proxy\/([^/?]+)\/ws(?:[?#]|$)/);
    if (!ibMatch) return;

    const sessionId = ibMatch[1];
    this.getSshHost(sessionId)
      .then((sshHost) => {
        if (!sshHost) {
          this.logger.warn(`[TtydProxy] No sshHost for session ${sessionId}`);
          socket.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n');
          return;
        }
        this.proxyWebSocket(socket, head, sshHost, 7681, req);
      })
      .catch((err: Error) => {
        this.logger.error(`[TtydProxy] DB lookup failed for session ${sessionId}: ${err.message}`);
        socket.end('HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n');
      });
  }

  // Raw WebSocket proxy: forwards the upgrade to <host>:<port>/ws.
  private proxyWebSocket(socket: Socket, head: Buffer, host: string, port: number, req: IncomingMessage): void {
    const forwardHeaders: Record<string, string | string[]> = {
      upgrade: 'websocket',
      connection: 'Upgrade',
      host: `${host}:${port}`,
      origin: `http://${host}:${port}`,
      'sec-websocket-version': (req.headers['sec-websocket-version'] as string) ?? '13',
      'sec-websocket-key': req.headers['sec-websocket-key'] as string,
    };
    if (req.headers['sec-websocket-protocol']) {
      forwardHeaders['sec-websocket-protocol'] = req.headers['sec-websocket-protocol'] as string;
    }

    const proxyReq = httpRequest({
      hostname: host,
      port,
      path: '/ws',
      method: 'GET',
      headers: forwardHeaders,
    });

    proxyReq.on('upgrade', (_res: IncomingMessage, proxySocket: Socket, proxyHead: Buffer) => {
      const lines = ['HTTP/1.1 101 Switching Protocols'];
      for (const [k, v] of Object.entries(_res.headers)) {
        if (v !== undefined) {
          lines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
        }
      }
      lines.push('', '');
      socket.write(lines.join('\r\n'));

      if (proxyHead && proxyHead.length > 0) socket.write(proxyHead);
      if (head && head.length > 0) proxySocket.write(head);

      proxySocket.pipe(socket, { end: false });
      socket.pipe(proxySocket, { end: false });

      const cleanup = () => {
        try { socket.destroy(); } catch {}
        try { proxySocket.destroy(); } catch {}
      };
      proxySocket.on('error', cleanup);
      socket.on('error', cleanup);
      proxySocket.on('close', cleanup);
      socket.on('close', cleanup);
    });

    proxyReq.on('error', (err: Error) => {
      this.logger.error(`[TtydProxy] Connect error to ${host}:${port}: ${err.message}`);
      socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
    });

    proxyReq.end();
  }
}
