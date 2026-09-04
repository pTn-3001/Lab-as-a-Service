import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateImageDto } from './dto/create-image.dto';
import { CreateImageVersionDto } from './dto/create-image-version.dto';
import { CreateImageDiffDto } from './dto/create-image-diff.dto';
import { spawnSync } from 'node:child_process';

@Injectable()
export class ImageService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateImageDto) {
    return this.prisma.image.create({ data: { ...dto } });
  }

  async findAll() {
    const images = await this.prisma.image.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return images.map((image) => ({
      ...image,
      latestVersionId: image.versions[0]?.id ?? null,
      latestVersionNumber: image.versions[0]?.versionNumber ?? null,
      latestVersionStatus: image.versions[0]?.status ?? null,
      latestVersionGlanceImageId: image.versions[0]?.glanceImageId ?? null,
    }));
  }

  async findOne(id: string) {
    const img = await this.prisma.image.findUnique({ where: { id } });
    if (!img) throw new NotFoundException('Image not found');
    const latestVersion = await this.prisma.imageVersion.findFirst({
      where: { imageId: id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...img,
      latestVersionId: latestVersion?.id ?? null,
      latestVersionNumber: latestVersion?.versionNumber ?? null,
      latestVersionStatus: latestVersion?.status ?? null,
      latestVersionGlanceImageId: latestVersion?.glanceImageId ?? null,
    };
  }

  async findPublished() {
    const images = await this.prisma.image.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      include: {
        versions: {
          where: { status: 'PUBLISHED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    return images
      .filter((img) => img.versions[0]?.glanceImageId)
      .map((img) => {
        const v = img.versions[0]!; // safe: filter above guarantees this
        return {
          id: img.id,
          name: img.name,
          slug: img.slug,
          description: img.description,
          createdById: img.createdById,
          createdAt: img.createdAt,
          glanceImageId: v.glanceImageId!,
          versionId: v.id,
          versionNumber: v.versionNumber,
          metadata: v.metadata,
        };
      });
  }

  async createVersion(imageId: string, dto: CreateImageVersionDto) {
    await this.findOne(imageId);
    const next = dto.versionNumber ?? 1;
    return this.prisma.imageVersion.create({
      data: {
        imageId,
        versionNumber: next,
        storageUrl: dto.storageUrl,
        metadata: dto.metadata ?? undefined,
        provisioningProfileId: dto.provisioningProfileId,
        createdById: dto.createdById,
      },
    });
  }

  async analyzeDiff(dto: CreateImageDiffDto) {
    const targetVersion = await this.prisma.imageVersion.findUnique({
      where: { id: dto.targetVersionId },
    });

    if (!targetVersion) {
      throw new NotFoundException('Target image version not found');
    }

    const baseVersion = dto.baseVersionId
      ? await this.prisma.imageVersion.findUnique({
          where: { id: dto.baseVersionId },
        })
      : null;

    if (dto.baseVersionId && !baseVersion) {
      throw new NotFoundException('Base image version not found');
    }

    const sourcePath = dto.storageUrl ?? baseVersion?.storageUrl;
    const targetPath = targetVersion.storageUrl;

    if (!targetPath) {
      throw new BadRequestException('Target image version must have a storageUrl');
    }

    const analysis = this.runLibguestfsDiff(sourcePath, targetPath);

    return this.prisma.imageDiff.create({
      data: {
        imageVersionId: dto.targetVersionId,
        baseVersionId: dto.baseVersionId,
        storageUrl: dto.storageUrl,
        analysisResult: analysis,
      },
    });
  }

  private runLibguestfsDiff(sourcePath: string | undefined, targetPath: string) {
    if (!sourcePath) {
      return {
        backend: 'fallback',
        status: 'missing_base_image',
        message: 'No base image supplied for diff analysis',
      };
    }

    const result = spawnSync('virt-diff', ['-a', sourcePath, '-A', targetPath], {
      encoding: 'utf8',
      windowsHide: true,
    });

    if (result.error) {
      return {
        backend: 'fallback',
        status: 'tool_unavailable',
        message: result.error.message,
      };
    }

    if (result.status !== 0) {
      return {
        backend: 'libguestfs',
        status: 'failed',
        exitCode: result.status,
        stderr: result.stderr,
        stdout: result.stdout,
      };
    }

    return {
      backend: 'libguestfs',
      status: 'success',
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  async updateVisibility(imageId: string, visibility: string) {
    const latestVersion = await this.prisma.imageVersion.findFirst({
      where: { imageId },
      orderBy: { versionNumber: 'desc' },
    });
    if (!latestVersion) {
      throw new NotFoundException('No version found for this image');
    }
    const currentMetadata = (latestVersion.metadata as Record<string, any>) || {};
    const updatedMetadata = { ...currentMetadata, visibility };

    return this.prisma.imageVersion.update({
      where: { id: latestVersion.id },
      data: { metadata: updatedMetadata },
    });
  }
}
