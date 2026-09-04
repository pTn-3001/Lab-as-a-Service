import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserLabAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async grantAccess(input: {
    labTemplateId: string;
    userId: string;
    grantedBy?: string;
    expiresAt?: Date | null;
  }) {
    const lab = await this.prisma.labTemplate.findFirst({
      where: { id: input.labTemplateId, deletedAt: null },
      select: { id: true, name: true, accessType: true },
    });
    if (!lab) throw new NotFoundException(`Lab template "${input.labTemplateId}" not found`);
    if (lab.accessType !== 'RESTRICTED') {
      throw new ConflictException(`Lab "${lab.name}" is PUBLIC — access grants are not needed`);
    }

    return this.prisma.userLabAccess.upsert({
      where: { userId_labTemplateId: { userId: input.userId, labTemplateId: input.labTemplateId } },
      create: {
        userId: input.userId,
        labTemplateId: input.labTemplateId,
        grantedBy: input.grantedBy ?? null,
        expiresAt: input.expiresAt ?? null,
      },
      update: {
        grantedBy: input.grantedBy ?? undefined,
        expiresAt: input.expiresAt !== undefined ? input.expiresAt : undefined,
        grantedAt: new Date(),
      },
    });
  }

  async revokeAccess(labTemplateId: string, userId: string) {
    const existing = await this.prisma.userLabAccess.findUnique({
      where: { userId_labTemplateId: { userId, labTemplateId } },
    });
    if (!existing) throw new NotFoundException('Access grant not found');
    await this.prisma.userLabAccess.delete({
      where: { userId_labTemplateId: { userId, labTemplateId } },
    });
  }

  async checkAccess(labTemplateId: string, userId: string): Promise<boolean> {
    const lab = await this.prisma.labTemplate.findFirst({
      where: { id: labTemplateId, deletedAt: null },
      select: { accessType: true },
    });
    if (!lab) throw new NotFoundException(`Lab template "${labTemplateId}" not found`);
    if (lab.accessType === 'PUBLIC') return true;

    const now = new Date();
    const grant = await this.prisma.userLabAccess.findUnique({
      where: { userId_labTemplateId: { userId, labTemplateId } },
    });
    return Boolean(grant && (!grant.expiresAt || grant.expiresAt > now));
  }

  async assertAccess(labTemplateId: string, userId: string) {
    const hasAccess = await this.checkAccess(labTemplateId, userId);
    if (!hasAccess) {
      throw new ForbiddenException('Bạn chưa được cấp quyền sử dụng lab này');
    }
  }

  async listUsersWithAccess(labTemplateId: string) {
    const lab = await this.prisma.labTemplate.findFirst({
      where: { id: labTemplateId, deletedAt: null },
      select: { id: true },
    });
    if (!lab) throw new NotFoundException(`Lab template "${labTemplateId}" not found`);

    return this.prisma.userLabAccess.findMany({
      where: { labTemplateId },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async listLabsForUser(userId: string) {
    const now = new Date();
    return this.prisma.userLabAccess.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        labTemplate: {
          select: { id: true, name: true, slug: true, status: true, accessType: true },
        },
      },
      orderBy: { grantedAt: 'desc' },
    });
  }
}
