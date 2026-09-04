import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CheckpointService {
  private readonly logger = new Logger(CheckpointService.name);

  constructor(private readonly prisma: PrismaService) {}

  async initCheckpoints(moduleId: string, sessionId: string): Promise<void> {
    const mod = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { definitionJson: true },
    });
    if (!mod) return;

    const definition = mod.definitionJson as Record<string, unknown>;
    const checkpoints = (
      (definition?.checkpoints as Array<{ id: string }>) ?? []
    ).filter((cp) => cp?.id);

    if (checkpoints.length === 0) return;

    await this.prisma.checkpointProgress.createMany({
      data: checkpoints.map((cp) => ({
        sessionId,
        checkpointId: cp.id,
      })),
      skipDuplicates: true,
    });

    this.logger.log(
      `Initialized ${checkpoints.length} checkpoint(s) for session ${sessionId}`,
    );
  }

  // Replaced by direct webhook signals from VMs (POST /api/v1/checkpoints/signal).
  async pollCheckpoints(): Promise<void> {
    return;
  }

  async signalCheckpoint(
    sessionId: string,
    checkpointCode: string,
  ): Promise<{ sessionId: string; checkpointCode: string; status: string }> {
    if (!sessionId?.trim() || !checkpointCode?.trim()) {
      throw new BadRequestException('sessionId and checkpointCode are required');
    }

    const session = await this.prisma.labSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    await this.prisma.checkpointProgress.upsert({
      where: {
        sessionId_checkpointId: { sessionId, checkpointId: checkpointCode },
      },
      create: {
        sessionId,
        checkpointId: checkpointCode,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
      update: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `Checkpoint ${checkpointCode} COMPLETED for session ${sessionId}`,
    );
    return { sessionId, checkpointCode, status: 'COMPLETED' };
  }

  async getCheckpoints(sessionId: string) {
    const session = await this.prisma.labSession.findUnique({
      where: { id: sessionId },
      include: { module: { select: { definitionJson: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');

    const definition = (session.module?.definitionJson ?? {}) as Record<
      string,
      unknown
    >;
    const cpDefs = (
      (definition?.checkpoints as Array<{
        id: string;
        name: string;
        description?: string;
        points?: number;
        hintCommand?: string;
      }>) ?? []
    ).filter((cp) => cp?.id);

    const progress = await this.prisma.checkpointProgress.findMany({
      where: { sessionId },
    });
    const progressById = new Map(progress.map((p) => [p.checkpointId, p]));

    const checkpoints = cpDefs.map((cp) => {
      const prog = progressById.get(cp.id);
      return {
        id: cp.id,
        name: cp.name,
        description: cp.description ?? null,
        hintCommand: cp.hintCommand ?? null,
        points: cp.points ?? 0,
        status: (prog?.status ?? 'PENDING') as string,
        completedAt: prog?.completedAt?.toISOString() ?? null,
      };
    });

    const total = checkpoints.length;
    const completed = checkpoints.filter((c) => c.status === 'COMPLETED').length;
    const totalPoints = checkpoints.reduce((sum, c) => sum + c.points, 0);
    const earnedPoints = checkpoints
      .filter((c) => c.status === 'COMPLETED')
      .reduce((sum, c) => sum + c.points, 0);

    return { checkpoints, total, completed, totalPoints, earnedPoints };
  }
}
