import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassLabDto } from './dto/create-class-lab.dto';
import { UpdateClassLabDto } from './dto/update-class-lab.dto';

@Injectable()
export class ClassLabService {
  private readonly logger = new Logger(ClassLabService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Assign a lab template to a class group.
  async create(dto: CreateClassLabDto) {
    try {
      const classLab = await this.prisma.classLab.create({
        data: {
          groupId: dto.groupId,
          labTemplateId: dto.labTemplateId,
          lessonId: dto.lessonId ?? null,
          title: dto.title,
          description: dto.description,
          deadline: dto.deadline ? new Date(dto.deadline) : null,
          isRequired: dto.isRequired ?? true,
          orderNo: dto.orderNo ?? 0,
        },
        include: {
          labTemplate: {
            select: { id: true, code: true, name: true, status: true, category: true },
          },
        },
      });

      this.logger.log(
        `ClassLab created: ${classLab.id} — template ${dto.labTemplateId} → group ${dto.groupId}`,
      );
      return classLab;
    } catch (error: any) {
      // Handle unique constraint violation on [groupId, labTemplateId].
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'This lab template is already assigned to this group',
        );
      }
      throw error;
    }
  }

  // Find all class labs for a group, include lab template details, ordered by orderNo.
  async findByGroup(groupId: string) {
    return this.prisma.classLab.findMany({
      where: { groupId },
      orderBy: { orderNo: 'asc' },
      include: {
        labTemplate: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            status: true,
            category: true,
            difficulty: true,
            modules: {
              select: {
                id: true,
                name: true,
                orderNo: true,
                definitionJson: true,
              },
            },
          },
        },
        lesson: {
          select: { id: true, title: true, orderNo: true },
        },
      },
    });
  }

  // Find all class labs for a lab template.
  async findByLab(labTemplateId: string) {
    return this.prisma.classLab.findMany({
      where: { labTemplateId },
      orderBy: { orderNo: 'asc' },
      include: {
        labTemplate: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            status: true,
          },
        },
      },
    });
  }

  // Find a single class lab with lab template and lesson detail.
  async findById(id: string) {
    const classLab = await this.prisma.classLab.findUnique({
      where: { id },
      include: {
        labTemplate: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            status: true,
            category: true,
            difficulty: true,
            modules: {
              select: {
                id: true,
                name: true,
                orderNo: true,
                definitionJson: true,
              },
            },
          },
        },
        lesson: {
          select: { id: true, title: true, orderNo: true },
        },
      },
    });

    if (!classLab) {
      throw new NotFoundException(`ClassLab "${id}" not found`);
    }

    return classLab;
  }

  // Update class lab fields (deadline, lesson attachment, etc.).
  async update(id: string, dto: UpdateClassLabDto) {
    await this.findById(id);

    const updated = await this.prisma.classLab.update({
      where: { id },
      data: {
        ...(dto.lessonId !== undefined && { lessonId: dto.lessonId || null }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.deadline !== undefined && {
          deadline: dto.deadline ? new Date(dto.deadline) : null,
        }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
        ...(dto.orderNo !== undefined && { orderNo: dto.orderNo }),
      },
      include: {
        labTemplate: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });

    this.logger.log(`ClassLab updated: ${id}`);
    return updated;
  }

  // Remove a lab assignment from a class group.
  async delete(id: string) {
    await this.findById(id);

    await this.prisma.classLab.delete({ where: { id } });

    this.logger.log(`ClassLab deleted: ${id}`);
  }
}
