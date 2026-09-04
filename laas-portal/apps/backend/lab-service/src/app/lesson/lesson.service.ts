import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Injectable()
export class LessonService {
  private readonly logger = new Logger(LessonService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Create a lesson; auto-calculate orderNo as max+1 for the group when not provided.
  async create(dto: CreateLessonDto, userId?: string) {
    let orderNo = dto.orderNo;

    if (orderNo === undefined || orderNo === null) {
      const maxLesson = await this.prisma.lesson.findFirst({
        where: { groupId: dto.groupId },
        orderBy: { orderNo: 'desc' },
        select: { orderNo: true },
      });
      orderNo = maxLesson ? maxLesson.orderNo + 1 : 0;
    }

    try {
      const lesson = await this.prisma.lesson.create({
        data: {
          groupId: dto.groupId,
          title: dto.title,
          description: dto.description,
          content: dto.content,
          type: dto.type ?? 'TEXT',
          resourceUrl: dto.resourceUrl,
          orderNo,
          isVisible: dto.isVisible ?? true,
          createdById: userId ?? null,
        },
      });

      this.logger.log(`Lesson created: ${lesson.id} in group ${dto.groupId}`);
      return lesson;
    } catch (error: any) {
      // Handle unique constraint violation on [groupId, orderNo].
      if (error?.code === 'P2002') {
        throw new ConflictException(
          `A lesson with orderNo ${orderNo} already exists in this group`,
        );
      }
      throw error;
    }
  }

  // Find all lessons for a group, ordered by orderNo, include classLabs count.
  async findByGroup(groupId: string) {
    const lessons = await this.prisma.lesson.findMany({
      where: { groupId },
      orderBy: { orderNo: 'asc' },
      include: {
        _count: { select: { classLabs: true } },
      },
    });

    return lessons.map(({ _count, ...rest }) => ({
      ...rest,
      classLabCount: _count.classLabs,
    }));
  }

  // Find a single lesson with its attached classLabs.
  async findById(id: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: {
        classLabs: {
          include: {
            labTemplate: {
              select: { id: true, name: true, code: true, status: true },
            },
          },
          orderBy: { orderNo: 'asc' },
        },
      },
    });

    if (!lesson) {
      throw new NotFoundException(`Lesson "${id}" not found`);
    }

    return lesson;
  }

  // Update lesson fields.
  async update(id: string, dto: UpdateLessonDto) {
    await this.findById(id);

    try {
      const updated = await this.prisma.lesson.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.content !== undefined && { content: dto.content }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.resourceUrl !== undefined && { resourceUrl: dto.resourceUrl }),
          ...(dto.orderNo !== undefined && { orderNo: dto.orderNo }),
          ...(dto.isVisible !== undefined && { isVisible: dto.isVisible }),
        },
      });

      this.logger.log(`Lesson updated: ${id}`);
      return updated;
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          `A lesson with orderNo ${dto.orderNo} already exists in this group`,
        );
      }
      throw error;
    }
  }

  // Delete a lesson; detach classLabs first by nullifying lessonId.
  async delete(id: string) {
    await this.findById(id);

    await this.prisma.$transaction([
      this.prisma.classLab.updateMany({
        where: { lessonId: id },
        data: { lessonId: null },
      }),
      this.prisma.lesson.delete({ where: { id } }),
    ]);

    this.logger.log(`Lesson deleted: ${id}`);
  }

  // Batch-update orderNo for multiple lessons in a single transaction.
  async reorder(items: { id: string; orderNo: number }[]) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.lesson.update({
          where: { id: item.id },
          data: { orderNo: item.orderNo },
        }),
      ),
    );

    this.logger.log(`Reordered ${items.length} lessons`);
  }
}
