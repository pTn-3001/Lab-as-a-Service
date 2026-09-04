import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProvisioningProfileService {
  constructor(private prisma: PrismaService) {}

  async create(data: { name: string; description?: string; metadata?: any; createdById: string }) {
    return this.prisma.provisioningProfile.create({ data });
  }

  async findAll() {
    return this.prisma.provisioningProfile.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const r = await this.prisma.provisioningProfile.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Provisioning profile not found');
    return r;
  }
}
