import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GuacamoleService } from '../guacamole/guacamole.service';
import { CheckpointService } from './checkpoint.service';
import axios from 'axios';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly orchestrationUrl = process.env.ORCHESTRATION_SERVICE_URL ?? 'http://localhost:3004/api';

  constructor(
    private prisma: PrismaService,
    private guacamoleService: GuacamoleService,
    private checkpointService: CheckpointService,
  ) {}

  async start(data: {
    moduleId?: string;
    userId: string;
    imageVersionId?: string;
    openstackStackId?: string;
    expiresAt?: Date | string;
    guacamole?: {
      host: string;
      port: number;
      username: string;
      label?: string;
      passwordRef?: string;
      metadata?: any;
    };
  }) {
    // Access guard: RESTRICTED labs require a valid UserLabAccess grant.
    if (data.moduleId) {
      const mod = await this.prisma.module.findUnique({
        where: { id: data.moduleId },
        select: {
          labTemplateId: true,
          labTemplate: { select: { accessType: true } },
        },
      });
      if (mod?.labTemplate?.accessType === 'RESTRICTED') {
        const now = new Date();
        const grant = await this.prisma.userLabAccess.findUnique({
          where: {
            userId_labTemplateId: { userId: data.userId, labTemplateId: mod.labTemplateId },
          },
        });
        if (!grant || (grant.expiresAt && grant.expiresAt <= now)) {
          throw new ForbiddenException('Bạn chưa được cấp quyền sử dụng lab này');
        }
      }
    }

    // Stop stale STARTING sessions for this user+module so only one active session exists at a time
    if (data.moduleId) {
      await this.prisma.labSession.updateMany({
        where: { userId: data.userId, moduleId: data.moduleId, status: 'STARTING' },
        data: { status: 'STOPPED', endedAt: new Date() },
      });
    }

    const s = await this.prisma.labSession.create({
      data: {
        moduleId: data.moduleId,
        userId: data.userId,
        imageVersionId: data.imageVersionId,
        openstackStackId: data.openstackStackId,
        status: 'STARTING',
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        startedAt: new Date(),
      },
    });

    const guacamoleConnection = data.guacamole
      ? await this.guacamoleService.createSshConnection({
          sessionId: s.id,
          host: data.guacamole.host,
          port: data.guacamole.port,
          username: data.guacamole.username,
          label: data.guacamole.label,
          passwordRef: data.guacamole.passwordRef,
          metadata: data.guacamole.metadata,
        })
      : null;

    // Fire-and-forget: create Heat stack for module-based lab sessions
    if (data.moduleId && !data.openstackStackId) {
      void this.launchModuleStack(s.id, data.moduleId, data.userId);
    }

    return { session: s, guacamoleConnection };
  }

  private async launchModuleStack(sessionId: string, moduleId: string, userId: string): Promise<void> {
    try {
      const artifacts = await this.prisma.artifact.findMany({
        where: { moduleId, type: { in: ['HEAT_TEMPLATE', 'CLOUD_INIT'] } },
        select: { type: true, fileName: true, contentText: true },
      });

      const heatArtifact = artifacts.find((a) => a.type === 'HEAT_TEMPLATE');
      if (!heatArtifact?.contentText) {
        this.logger.warn(`[Session] No Heat template artifact found for module ${moduleId}`);
        return;
      }

      const files: Record<string, string> = {};
      for (const a of artifacts) {
        if (a.type === 'CLOUD_INIT' && a.contentText) {
          const filename = a.fileName.split('/').pop() ?? a.fileName;
          files[filename] = a.contentText;
        }
      }

      const stackName = `lab-${sessionId.slice(-8)}`;
      const laasPublicUrl = (process.env.LAAS_PUBLIC_URL ?? '').trim();
      const res = await axios.post<{ data?: { stack?: { id?: string; name?: string } } }>(
        `${this.orchestrationUrl}/v1/openstack/stacks`,
        {
          stackName,
          template: heatArtifact.contentText,
          labSessionId: sessionId,
          files: Object.keys(files).length > 0 ? files : undefined,
          disableRollback: true,
          parameters: laasPublicUrl
            ? { session_id: sessionId, laas_api_url: laasPublicUrl }
            : { session_id: sessionId },
        },
        { headers: { 'x-user-id': userId }, timeout: 15000 },
      );

      const stackId = res.data?.data?.stack?.id;
      const resolvedStackName = res.data?.data?.stack?.name ?? stackName;
      if (stackId) {
        await this.prisma.labSession.update({
          where: { id: sessionId },
          data: { openstackStackId: stackId, openstackStackName: resolvedStackName },
        });
        this.logger.log(`[Session] Stack ${stackId} created for session ${sessionId}`);
        // Poll until CREATE_COMPLETE + NAT ready, then transition session to RUNNING
        void this.pollStackUntilReady(sessionId, stackId, resolvedStackName, userId);
      }
    } catch (err) {
      this.logger.error(
        `[Session] Failed to launch stack for session ${sessionId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Background poller: calls orchestration every 10s until the Heat stack reaches
   * CREATE_COMPLETE, then waits 30s for NAT setup to finish, extracts vmTerminals
   * from stack outputs, and transitions the session to RUNNING.
   * Runs fire-and-forget — never throws.
   */
  private async pollStackUntilReady(
    sessionId: string,
    stackId: string,
    stackName: string,
    userId: string,
  ): Promise<void> {
    const pollIntervalMs = 10_000;
    const maxAttempts = 72; // 72 × 10s = 12 minutes
    const natSettleMs = 30_000; // wait after CREATE_COMPLETE for orchestration NAT setup
    let createCompleteAt: number | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise<void>((r) => setTimeout(r, pollIntervalMs));

      try {
        const res = await axios.get<{
          success?: boolean;
          data?: {
            stack?: {
              status?: string;
              outputs?: Array<{ key: string; value: unknown }>;
            };
          };
        }>(
          `${this.orchestrationUrl}/v1/openstack/stacks/${encodeURIComponent(stackName)}/${encodeURIComponent(stackId)}/resources`,
          { headers: { 'x-user-id': userId }, timeout: 15_000 },
        );

        const stack = res.data?.data?.stack;
        const status = stack?.status ?? '';

        this.logger.log(`[Session] Poll ${attempt}/${maxAttempts} stack "${stackName}": ${status}`);

        if (status === 'CREATE_FAILED' || status === 'ROLLBACK_COMPLETE' || status === 'DELETE_COMPLETE') {
          this.logger.warn(`[Session] Stack "${stackName}" terminal status ${status} — stopping session ${sessionId}`);
          await this.prisma.labSession.update({
            where: { id: sessionId },
            data: { status: 'STOPPED', endedAt: new Date() },
          });
          return;
        }

        if (status !== 'CREATE_COMPLETE') continue;

        // Record first time we see CREATE_COMPLETE and keep waiting for NAT
        if (!createCompleteAt) {
          createCompleteAt = Date.now();
          this.logger.log(`[Session] Stack "${stackName}" is CREATE_COMPLETE — waiting ${natSettleMs / 1000}s for NAT setup`);
          continue;
        }

        if (Date.now() - createCompleteAt < natSettleMs) continue;

        // Check if orchestration-service callback already set vmTerminals (race avoidance).
        const existingSession = await this.prisma.labSession.findUnique({
          where: { id: sessionId },
          select: { vmTerminals: true, status: true },
        });
        const existingTerminals = existingSession?.vmTerminals as Array<{ vmName: string; floatingIp: string; ttydPort: number }> | null;
        if (Array.isArray(existingTerminals) && existingTerminals.length > 0) {
          // vmTerminals already set by orchestration callback — just ensure session is RUNNING
          if (existingSession?.status !== 'RUNNING') {
            await this.attachStack(sessionId, stackId, stackName);
          }
          this.logger.log(
            `[Session] Session ${sessionId} already has ${existingTerminals.length} terminal(s) from orchestration callback — skipping poller overwrite`,
          );
          return;
        }

        // NAT settle time elapsed — extract terminals from Heat outputs
        const outputs = stack?.outputs ?? [];
        const vmTerminals = this.extractVmTerminals(outputs);

        if (vmTerminals.length === 0) {
          this.logger.warn(`[Session] Stack "${stackName}" CREATE_COMPLETE but no ttyd terminals in outputs yet`);
          continue;
        }

        const sshNatHost = vmTerminals[0]?.floatingIp ?? '';
        await this.updateVmTerminals(sessionId, { vmTerminals, sshNatHost });
        await this.attachStack(sessionId, stackId, stackName);
        this.logger.log(
          `[Session] Session ${sessionId} is RUNNING — ${vmTerminals.length} terminal(s) on ${sshNatHost}`,
        );
        return;
      } catch (err) {
        this.logger.warn(
          `[Session] Poll error (attempt ${attempt}) for stack "${stackName}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.error(`[Session] Timed out waiting for stack "${stackName}" (session ${sessionId})`);
  }

  /** Parse Heat stack outputs into vmTerminals for ttyd routing. */
  private extractVmTerminals(
    outputs: Array<{ key: string; value: unknown }>,
  ): Array<{ vmName: string; floatingIp: string; ttydPort: number }> {
    const byKey = new Map(outputs.map((o) => [o.key, o.value]));
    const sshNatHost =
      typeof byKey.get('ssh_nat_host') === 'string' ? String(byKey.get('ssh_nat_host')).trim() : '';

    const terminals: Array<{ vmName: string; floatingIp: string; ttydPort: number }> = [];

    // Mode 1: Shared NAT host + *_ttyd_nat_port
    if (sshNatHost) {
      for (const [key, value] of byKey.entries()) {
        if (!key.endsWith('_ttyd_nat_port')) continue;
        const vmKey = key.slice(0, -'_ttyd_nat_port'.length);
        const vmNameRaw = byKey.get(`${vmKey}_name`);
        const vmName = typeof vmNameRaw === 'string' && vmNameRaw.trim() ? vmNameRaw.trim() : vmKey;
        const ttydPort =
          typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : NaN;
        if (!Number.isInteger(ttydPort) || ttydPort < 1) continue;
        terminals.push({ vmName, floatingIp: sshNatHost, ttydPort });
      }
      if (terminals.length > 0) return terminals;
    }

    // Mode 2: Per-VM direct floating IP (*_floating_ip)
    for (const [key, value] of byKey.entries()) {
      if (!key.endsWith('_floating_ip')) continue;
      const vmKey = key.slice(0, -'_floating_ip'.length);
      const vmNameRaw = byKey.get(`${vmKey}_name`);
      const vmName = typeof vmNameRaw === 'string' && vmNameRaw.trim() ? vmNameRaw.trim() : vmKey;
      const floatingIp = typeof value === 'string' ? value.trim() : '';
      if (!floatingIp) continue;
      terminals.push({ vmName, floatingIp, ttydPort: 7681 });
    }

    // Mode 3: Fallback for any IP output in Heat stack
    if (terminals.length === 0) {
      const anyIp = Array.from(byKey.values()).find(
        (v) => typeof v === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v.trim()),
      );
      if (anyIp) {
        const vmName = typeof byKey.get('vm_name') === 'string' ? String(byKey.get('vm_name')) : 'lab-node';
        terminals.push({ vmName, floatingIp: String(anyIp).trim(), ttydPort: 7681 });
      }
    }

    return terminals;
  }

  async attachStack(
    sessionId: string,
    openstackStackId: string,
    openstackStackName?: string,
  ) {
    const session = await this.prisma.labSession.findUnique({
      where: { id: sessionId },
      include: { module: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    // Idempotent: skip if already transitioned (e.g. orchestration callback fired first)
    if (session.status === 'RUNNING') return session;

    // Recalculate expiresAt when transitioning to RUNNING to ensure student gets the full estimated minutes
    let expiresAt: Date | undefined = undefined;
    if (session.module?.estimatedMinutes) {
      expiresAt = new Date(Date.now() + session.module.estimatedMinutes * 60 * 1000);
    }

    const updated = await this.prisma.labSession.update({
      where: { id: sessionId },
      data: {
        openstackStackId,
        openstackStackName: openstackStackName ?? undefined,
        status: 'RUNNING',
        ...(expiresAt && { expiresAt }),
      },
    });

    if (session.moduleId) {
      await this.checkpointService.initCheckpoints(session.moduleId, sessionId);
    }

    return updated;
  }

  async stop(id: string) {
    const session = await this.prisma.labSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    return this.prisma.labSession.update({
      where: { id },
      data: { status: 'STOPPED', endedAt: new Date() },
    });
  }

  async findOne(id: string) {
    const s = await this.prisma.labSession.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Session not found');
    return s;
  }

  async findActiveByUserAndModule(userId: string, moduleId: string) {
    const now = Date.now();
    // A STARTING session is only considered "live" if:
    // - It has an openstackStackId (stack initiated) AND is < 20 min old
    //   (Heat creation ~5 min + NAT setup ~2 min → 20 min gives safe headroom)
    // - OR it has no openstackStackId (pre-orchestration) AND is < 5 min old
    // Beyond these windows the session is assumed stuck/dead → caller will create a new one.
    return this.prisma.labSession.findFirst({
      where: {
        userId,
        moduleId,
        OR: [
          { status: 'RUNNING' },
          {
            status: 'STARTING',
            openstackStackId: { not: null },
            startedAt: { gte: new Date(now - 20 * 60 * 1000) },
          },
          {
            status: 'STARTING',
            openstackStackId: null,
            startedAt: { gte: new Date(now - 5 * 60 * 1000) },
          },
        ],
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true, moduleId: true, userId: true, startedAt: true, status: true },
    });
  }

  async updateVmTerminals(
    sessionId: string,
    data: { vmTerminals: Array<{ vmName: string; floatingIp: string; ttydPort: number }>; sshNatHost?: string },
  ) {
    const session = await this.prisma.labSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    return this.prisma.labSession.update({
      where: { id: sessionId },
      data: {
        vmTerminals: data.vmTerminals,
        ...(data.sshNatHost ? { sshNatHost: data.sshNatHost } : {}),
      },
    });
  }

  async findAll(opts?: { status?: string; limit?: number; offset?: number; userId?: string; labTemplateId?: string }) {
    const where: Record<string, unknown> = {};
    if (opts?.status) where['status'] = opts.status;
    if (opts?.userId) where['userId'] = opts.userId;
    if (opts?.labTemplateId) {
      where['module'] = { labTemplateId: opts.labTemplateId };
    }

    return this.prisma.labSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
      include: {
        module: {
          select: {
            id: true,
            name: true,
            orderNo: true,
            labTemplateId: true,
            labTemplate: { select: { id: true, name: true, code: true } },
          },
        },
        CheckpointProgress: {
          select: {
            id: true,
            checkpointId: true,
            status: true,
            completedAt: true,
          },
        },
      },
    });
  }
}
