import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLabTemplateDto } from './dto/create-lab-template.dto';
import { UpdateLabTemplateDto } from './dto/update-lab-template.dto';
import { QueryLabTemplateDto } from './dto/query-lab-template.dto';
import {
  ArtifactType,
  Prisma,
  LabTemplateStatus,
  LabAccessType,
  ValidationStatus,
  RenderStatus,
} from '../../generated/prisma-client';
import { buildPagination } from '../common/response.helper';
import { ArtifactGenerationService } from '../common/artifact-generation.service';

@Injectable()
export class LabTemplateService {
  private readonly logger = new Logger(LabTemplateService.name);

  constructor(
    private prisma: PrismaService,
    private artifactGenerationService: ArtifactGenerationService,
  ) {}

  // Create lab template with uniqueness checks and immediate artifact snapshot.
  async create(dto: CreateLabTemplateDto) {
    // Check unique code
    const existing = await this.prisma.labTemplate.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Lab template with code "${dto.code}" already exists`);
    }

    const slugExisting = await this.prisma.labTemplate.findUnique({
      where: { slug: dto.slug },
    });
    if (slugExisting) {
      throw new ConflictException(`Lab template with slug "${dto.slug}" already exists`);
    }

    const lab = await this.prisma.labTemplate.create({
      data: {
        code: dto.code,
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        category: dto.category,
        difficulty: dto.difficulty,
        status: (dto.status as LabTemplateStatus) ?? LabTemplateStatus.DRAFT,
        accessType: (dto.accessType as LabAccessType) ?? LabAccessType.PUBLIC,
        tags: dto.tags ?? Prisma.JsonNull,
        metadata: dto.metadata ?? Prisma.JsonNull,
        createdById: dto.createdById,
        createdBySnapshot: dto.createdBySnapshot ?? Prisma.JsonNull,
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        version: true,
        createdAt: true,
      },
    });

    this.logger.log(`Lab template created: ${lab.id}`);
    await this.artifactGenerationService.regenerateForLab(lab.id);
    return lab;
  }

  // Query lab templates for dashboard table or student catalog.
  // When userId is provided, each item includes hasAccess flag computed in one batch query.
  async findAll(query: QueryLabTemplateDto) {
    const { page = 1, limit = 10, keyword, status, category, difficulty, createdById, accessType, userId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LabTemplateWhereInput = {
      deletedAt: null,
      ...(status && {
        status: status === 'NOT_REVIEW'
          ? { not: 'REVIEW' as any }
          : (status as any),
      }),
      ...(accessType && { accessType: accessType as LabAccessType }),
      ...(category && { category }),
      ...(difficulty && { difficulty }),
      ...(createdById && { createdById }),
      ...(keyword && {
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { code: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.labTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          code: true,
          name: true,
          category: true,
          difficulty: true,
          status: true,
          accessType: true,
          version: true,
          validationStatus: true,
          renderStatus: true,
          metadata: true,
          updatedAt: true,
          createdAt: true,
          createdById: true,
          _count: { select: { modules: true } },
        },
      }),
      this.prisma.labTemplate.count({ where }),
    ]);

    // Batch-load user access grants to avoid N+1 queries.
    const grantedLabIds = new Set<string>();
    if (userId) {
      const now = new Date();
      const grants = await this.prisma.userLabAccess.findMany({
        where: {
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { labTemplateId: true },
      });
      grants.forEach((g) => grantedLabIds.add(g.labTemplateId));
    }

    const mapped = items.map(({ _count, accessType: at, ...rest }) => ({
      ...rest,
      accessType: at,
      moduleCount: _count.modules,
      hasAccess: at === LabAccessType.PUBLIC || (userId ? grantedLabIds.has(rest.id) : undefined),
    }));

    return { items: mapped, pagination: buildPagination(page, limit, total) };
  }

  // Read one active (not soft-deleted) lab template.
  async findOne(id: string) {
    const lab = await this.prisma.labTemplate.findFirst({
      where: { id, deletedAt: null },
    });
    if (!lab) throw new NotFoundException(`Lab template "${id}" not found`);
    return lab;
  }

  // Update metadata and regenerate artifacts so downstream initialization stays in sync.
  async update(id: string, dto: UpdateLabTemplateDto) {
    await this.findOne(id);
    const updated = await this.prisma.labTemplate.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.difficulty !== undefined && { difficulty: dto.difficulty }),
        ...(dto.accessType !== undefined && { accessType: dto.accessType as LabAccessType }),
        ...(dto.status !== undefined && { status: dto.status as LabTemplateStatus }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.metadata !== undefined && { metadata: dto.metadata }),
      },
    });

    await this.artifactGenerationService.regenerateForLab(id);
    return updated;
  }

  // Soft-delete preserves DB history while removing generated artifacts.
  async softDelete(id: string) {
    await this.findOne(id);
    await this.prisma.labTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.artifactGenerationService.clearLabArtifacts(id);
  }

  // Publish only when validation/render/module guards are satisfied.
  async publish(id: string) {
    const lab = await this.findOne(id);

    // Guards
    if (lab.status === LabTemplateStatus.PUBLISHED) {
      throw new BadRequestException('Lab template is already published');
    }
    if (lab.validationStatus !== ValidationStatus.VALID) {
      throw new BadRequestException(
        'Lab template must pass validation before publishing',
      );
    }
    if (lab.renderStatus !== RenderStatus.SUCCESS) {
      throw new BadRequestException(
        'Lab template must be rendered successfully before publishing',
      );
    }

    const moduleCount = await this.prisma.module.count({
      where: { labTemplateId: id, deletedAt: null },
    });
    if (moduleCount === 0) {
      throw new BadRequestException('Lab template must have at least one module');
    }

    const updated = await this.prisma.labTemplate.update({
      where: { id },
      data: {
        status: LabTemplateStatus.PUBLISHED,
        version: { increment: 1 },
      },
      select: { id: true, status: true, version: true },
    });

    this.logger.log(`Lab template published: ${id} v${updated.version}`);
    return updated;
  }

  // Archive is a lightweight status transition.
  async archive(id: string) {
    await this.findOne(id);
    const updated = await this.prisma.labTemplate.update({
      where: { id },
      data: { status: LabTemplateStatus.ARCHIVED },
      select: { id: true, status: true },
    });
    return updated;
  }

  // Return latest Heat/cloud-init artifacts consumed by admin-portal initialization flow.
  async getArtifactsForInitialization(id: string) {
    const lab = await this.prisma.labTemplate.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!lab) {
      throw new NotFoundException(`Lab template "${id}" not found`);
    }

    // Always regenerate so initialization uses latest Heat/cloud-init rendering rules.
    await this.artifactGenerationService.regenerateForLab(id);

    const modules = await this.prisma.module.findMany({
      where: { labTemplateId: id, deletedAt: null },
      orderBy: { orderNo: 'asc' },
      select: {
        id: true,
        name: true,
        orderNo: true,
        estimatedMinutes: true,
      },
    });

    const artifacts = await this.prisma.artifact.findMany({
      where: {
        labTemplateId: id,
        moduleId: { not: null },
        type: {
          in: [ArtifactType.HEAT_TEMPLATE, ArtifactType.CLOUD_INIT],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        moduleId: true,
        type: true,
        nodeName: true,
        fileName: true,
        contentText: true,
      },
    });

    const groupedByModule = new Map<string, typeof artifacts>();

    for (const artifact of artifacts) {
      if (!artifact.moduleId) {
        continue;
      }

      const current = groupedByModule.get(artifact.moduleId) ?? [];
      current.push(artifact);
      groupedByModule.set(artifact.moduleId, current);
    }

    return {
      lab,
      modules: modules.map((moduleItem) => {
        const moduleArtifacts = groupedByModule.get(moduleItem.id) ?? [];
        const heatTemplate = moduleArtifacts.find(
          (artifact) => artifact.type === ArtifactType.HEAT_TEMPLATE
        );
        const cloudInitFiles = moduleArtifacts
          .filter((artifact) => artifact.type === ArtifactType.CLOUD_INIT)
          .map((artifact) => ({
            nodeName: artifact.nodeName,
            fileName: artifact.fileName,
            contentText: artifact.contentText,
          }));

        return {
          ...moduleItem,
          heatTemplate: heatTemplate
            ? {
                fileName: heatTemplate.fileName,
                contentText: heatTemplate.contentText,
              }
            : null,
          cloudInitFiles,
        };
      }),
    };
  }
}
