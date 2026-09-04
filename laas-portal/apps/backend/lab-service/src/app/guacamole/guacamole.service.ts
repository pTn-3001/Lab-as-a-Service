import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GuacamoleService {
  constructor(private prisma: PrismaService) {}

  async createConnection(data: {
    sessionId?: string;
    label?: string;
    protocol: string;
    host: string;
    port: number;
    username?: string;
    passwordRef?: string;
    metadata?: any;
  }) {
    return this.prisma.guacamoleConnection.create({ data });
  }

  async createSshConnection(data: {
    sessionId?: string;
    host: string;
    port: number;
    username: string;
    label?: string;
    passwordRef?: string;
    metadata?: any;
  }) {
    const sshUrl = this.buildSshUrl(data.host, data.username, data.port);
    return this.createConnection({
      sessionId: data.sessionId,
      label: data.label ?? `SSH ${data.host}:${data.port}`,
      protocol: 'ssh',
      host: data.host,
      port: data.port,
      username: data.username,
      passwordRef: data.passwordRef,
      metadata: {
        ...(data.metadata ?? {}),
        sshUrl,
      },
    });
  }

  async listForSession(sessionId: string) {
    return this.prisma.guacamoleConnection.findMany({ where: { sessionId } });
  }

  public buildSshUrl(host: string, username: string, port = 22): string | null {
    const baseUrl = this.resolveGuacamoleBaseUrl();
    if (!baseUrl) {
      return null;
    }

    const template = (process.env.GUACAMOLE_SSH_URL_TEMPLATE || '').trim();
    if (template) {
      return template
        .replace('{baseUrl}', baseUrl.replace(/\/+$/, ''))
        .replace('{host}', encodeURIComponent(host))
        .replace('{username}', encodeURIComponent(username))
        .replace('{port}', String(port));
    }

    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    return `${normalizedBaseUrl}/#/client/quickconnect?protocol=ssh&hostname=${encodeURIComponent(host)}&port=${port}&username=${encodeURIComponent(username)}`;
  }

  private resolveGuacamoleBaseUrl(): string {
    const configuredBaseUrl = (process.env.GUACAMOLE_BASE_URL || '').trim();
    if (configuredBaseUrl) {
      return configuredBaseUrl;
    }

    const identityUrl = (process.env.OPENSTACK_IDENTITY_URL || '').trim();
    if (!identityUrl) {
      return '';
    }

    try {
      const parsedIdentity = new URL(identityUrl);
      return `${parsedIdentity.origin}/guacamole`;
    } catch {
      return '';
    }
  }
}
