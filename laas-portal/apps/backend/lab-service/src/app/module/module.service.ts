import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { ReorderModulesDto } from './dto/reorder-modules.dto';
import { Prisma, ModuleStatus, ValidationStatus } from '../../generated/prisma-client';
import { ArtifactGenerationService } from '../common/artifact-generation.service';

@Injectable()
export class ModuleService {
  private readonly logger = new Logger(ModuleService.name);

  constructor(
    private prisma: PrismaService,
    private artifactGenerationService: ArtifactGenerationService,
  ) {}

  // Create module and invalidate lab validation/render state.
  async create(labTemplateId: string, dto: CreateModuleDto) {
    // Ensure lab exists
    const lab = await this.prisma.labTemplate.findFirst({
      where: { id: labTemplateId, deletedAt: null },
    });
    if (!lab) throw new NotFoundException(`Lab template "${labTemplateId}" not found`);

    let targetOrderNo = dto.orderNo;
    if (!targetOrderNo || targetOrderNo <= 0) {
      const maxMod = await this.prisma.module.findFirst({
        where: { labTemplateId, deletedAt: null },
        orderBy: { orderNo: 'desc' },
      });
      targetOrderNo = (maxMod?.orderNo ?? 0) + 1;
    }

    // Check unique orderNo per lab
    const existing = await this.prisma.module.findUnique({
      where: { labTemplateId_orderNo: { labTemplateId, orderNo: targetOrderNo } },
    });
    if (existing) {
      if (!existing.deletedAt) {
        throw new ConflictException(
          `A module with orderNo ${targetOrderNo} already exists in this lab`,
        );
      } else {
        // Free up the unique constraint from soft-deleted record
        await this.prisma.module.update({
          where: { id: existing.id },
          data: {
            orderNo: -Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 100000),
          },
        });
      }
    }

    const mod = await this.prisma.module.create({
      data: {
        labTemplateId,
        name: dto.name,
        description: dto.description,
        orderNo: targetOrderNo,
        estimatedMinutes: dto.estimatedMinutes,
        objectives: dto.objectives ?? Prisma.JsonNull,
        definitionJson: dto.definitionJson,
        createdById: dto.createdById,
        createdBySnapshot: dto.createdBySnapshot ?? Prisma.JsonNull,
      },
      select: {
        id: true,
        name: true,
        orderNo: true,
        status: true,
        validationStatus: true,
        estimatedMinutes: true,
        description: true,
        objectives: true,
        definitionJson: true,
        updatedAt: true,
      },
    });

    // Reset lab validation/render status
    await this.prisma.labTemplate.update({
      where: { id: labTemplateId },
      data: {
        validationStatus: ValidationStatus.NOT_VALIDATED,
        renderStatus: 'PENDING',
      },
    });

    await this.artifactGenerationService.regenerateForLab(labTemplateId);

    this.logger.log(`Module created: ${mod.id} for lab ${labTemplateId}`);
    return mod;
  }

  // Read all active modules of a lab template.
  async findAllByLab(labTemplateId: string) {
    const lab = await this.prisma.labTemplate.findFirst({
      where: { id: labTemplateId, deletedAt: null },
    });
    if (!lab) throw new NotFoundException(`Lab template "${labTemplateId}" not found`);

    return this.prisma.module.findMany({
      where: { labTemplateId, deletedAt: null },
      orderBy: { orderNo: 'asc' },
      select: {
        id: true,
        name: true,
        orderNo: true,
        status: true,
        validationStatus: true,
        estimatedMinutes: true,
        updatedAt: true,
        description: true,
        objectives: true,
        definitionJson: true,
      },
    });
  }

  // Read one active module.
  async findOne(id: string) {
    const mod = await this.prisma.module.findFirst({
      where: { id, deletedAt: null },
    });
    if (!mod) throw new NotFoundException(`Module "${id}" not found`);
    return mod;
  }

  // Update module and reset validation state when definition changes.
  async update(id: string, dto: UpdateModuleDto) {
    const mod = await this.findOne(id);

    // If changing orderNo, check conflict
    if (dto.orderNo && dto.orderNo !== mod.orderNo) {
      const conflict = await this.prisma.module.findUnique({
        where: {
          labTemplateId_orderNo: {
            labTemplateId: mod.labTemplateId,
            orderNo: dto.orderNo,
          },
        },
      });
      if (conflict && conflict.id !== id) {
        if (!conflict.deletedAt) {
          throw new ConflictException(
            `A module with orderNo ${dto.orderNo} already exists`,
          );
        } else {
          // Free up the unique constraint from soft-deleted record
          await this.prisma.module.update({
            where: { id: conflict.id },
            data: {
              orderNo: -Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 100000),
            },
          });
        }
      }
    }

    const updated = await this.prisma.module.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.orderNo && { orderNo: dto.orderNo }),
        ...(dto.estimatedMinutes !== undefined && { estimatedMinutes: dto.estimatedMinutes }),
        ...(dto.objectives !== undefined && { objectives: dto.objectives }),
        ...(dto.definitionJson && {
          definitionJson: dto.definitionJson,
          normalizedJson: null,
          validationStatus: ValidationStatus.NOT_VALIDATED,
          status: ModuleStatus.DRAFT,
        }),
      },
      select: {
        id: true,
        name: true,
        orderNo: true,
        status: true,
        validationStatus: true,
        estimatedMinutes: true,
        description: true,
        objectives: true,
        definitionJson: true,
        updatedAt: true,
      },
    });

    // Reset lab if definition changed
    if (dto.definitionJson) {
      await this.prisma.labTemplate.update({
        where: { id: mod.labTemplateId },
        data: {
          validationStatus: ValidationStatus.NOT_VALIDATED,
          renderStatus: 'PENDING',
        },
      });
    }

    await this.artifactGenerationService.regenerateForLab(mod.labTemplateId);

    return updated;
  }

  // Soft-delete module and regenerate artifacts.
  async softDelete(id: string) {
    const mod = await this.findOne(id);
    await this.prisma.module.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        orderNo: -Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 100000),
      },
    });

    // Reset lab
    await this.prisma.labTemplate.update({
      where: { id: mod.labTemplateId },
      data: {
        validationStatus: ValidationStatus.NOT_VALIDATED,
        renderStatus: 'PENDING',
      },
    });

    await this.artifactGenerationService.regenerateForLab(mod.labTemplateId);
  }

  // Batch reorder in a transaction to avoid partial ordering writes.
  async reorder(labTemplateId: string, dto: ReorderModulesDto) {
    const lab = await this.prisma.labTemplate.findFirst({
      where: { id: labTemplateId, deletedAt: null },
    });
    if (!lab) throw new NotFoundException(`Lab template "${labTemplateId}" not found`);

    // Perform all updates in a transaction
    await this.prisma.$transaction(
      dto.items.map(({ moduleId, orderNo }) =>
        this.prisma.module.update({
          where: { id: moduleId },
          data: { orderNo },
        }),
      ),
    );

    await this.artifactGenerationService.regenerateForLab(labTemplateId);
  }
}
