import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncGradeDto, ManualGradeDto, QueryGradesDto } from './dto/grade.dto';
import { buildPagination } from '../common/response.helper';

@Injectable()
export class GradeService {
  private readonly logger = new Logger(GradeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sync checkpoint data from lab-service into a LabGrade record.
   * Called by frontend or lab-service webhook when a session ends or checkpoints update.
   * Upserts the LabGrade and replaces CheckpointSnapshots.
   */
  async syncGrade(dto: SyncGradeDto) {
    const { classLabId, groupId, studentId, labTemplateId, sessionId, checkpoints } = dto;

    // 1. Find or create base LabGrade record
    let grade = await this.prisma.labGrade.findUnique({
      where: {
        classLabId_studentId: { classLabId, studentId },
      },
    });

    if (!grade) {
      grade = await this.prisma.labGrade.create({
        data: {
          classLabId,
          groupId,
          studentId,
          labTemplateId,
          sessionId,
          status: 'IN_PROGRESS',
        },
      });
    } else {
      await this.prisma.labGrade.update({
        where: { id: grade.id },
        data: {
          sessionId: sessionId || grade.sessionId,
          groupId,
          labTemplateId,
        },
      });
    }

    // 2. Upsert checkpoint snapshots (accumulates progress across all modules)
    for (const cp of checkpoints) {
      const assignedPoints = cp.points && cp.points > 0 ? cp.points : 10;
      const isCompleted = cp.status === 'COMPLETED';

      await this.prisma.checkpointSnapshot.upsert({
        where: {
          labGradeId_checkpointId: {
            labGradeId: grade.id,
            checkpointId: cp.id,
          },
        },
        create: {
          labGradeId: grade.id,
          checkpointId: cp.id,
          checkpointName: cp.name,
          points: assignedPoints,
          status: cp.status || 'PENDING',
          completedAt: isCompleted ? (cp.completedAt ? new Date(cp.completedAt) : new Date()) : null,
        },
        update: {
          checkpointName: cp.name,
          points: assignedPoints,
          status: cp.status,
          ...(isCompleted ? { completedAt: cp.completedAt ? new Date(cp.completedAt) : new Date() } : {}),
        },
      });
    }

    // 3. Fetch all snapshots across all modules for this student's classLab
    const allSnapshots = await this.prisma.checkpointSnapshot.findMany({
      where: { labGradeId: grade.id },
    });

    const totalCheckpoints = allSnapshots.length;
    const completedCheckpoints = allSnapshots.filter((s) => s.status === 'COMPLETED').length;
    const totalPoints = allSnapshots.reduce((sum, s) => sum + (s.points > 0 ? s.points : 10), 0);
    const earnedPoints = allSnapshots
      .filter((s) => s.status === 'COMPLETED')
      .reduce((sum, s) => sum + (s.points > 0 ? s.points : 10), 0);

    const percentage = totalPoints > 0
      ? Math.round((earnedPoints / totalPoints) * 100 * 100) / 100
      : (totalCheckpoints > 0 ? Math.round((completedCheckpoints / totalCheckpoints) * 100) : 0);

    const status = dto.status
      ? dto.status
      : completedCheckpoints === totalCheckpoints && totalCheckpoints > 0
      ? 'COMPLETED'
      : completedCheckpoints > 0
      ? 'FINISHED'
      : 'NOT_STARTED';

    // 4. Update the aggregate stats in LabGrade
    await this.prisma.labGrade.update({
      where: { id: grade.id },
      data: {
        earnedPoints,
        totalPoints,
        percentage,
        completedCheckpoints,
        totalCheckpoints,
        status,
        ...(status === 'COMPLETED' ? { gradedAt: new Date() } : {}),
      },
    });

    this.logger.log(
      `Synced grade for student=${studentId} classLab=${classLabId}: ${earnedPoints}/${totalPoints} (${completedCheckpoints}/${totalCheckpoints} CPs, ${percentage}%)`,
    );

    return this.findById(grade.id);
  }

  /**
   * Instructor manually grades or adds feedback.
   */
  async manualGrade(gradeId: string, dto: ManualGradeDto) {
    const existing = await this.prisma.labGrade.findUnique({ where: { id: gradeId } });
    if (!existing) throw new NotFoundException('Grade not found');

    return this.prisma.labGrade.update({
      where: { id: gradeId },
      data: {
        ...(dto.manualScore !== undefined ? { manualScore: dto.manualScore } : {}),
        ...(dto.feedback !== undefined ? { feedback: dto.feedback } : {}),
        status: 'GRADED',
        gradedAt: new Date(),
      },
      include: { checkpointSnapshots: true },
    });
  }

  /**
   * Get a single grade with checkpoint details.
   */
  async findById(id: string) {
    const grade = await this.prisma.labGrade.findUnique({
      where: { id },
      include: {
        checkpointSnapshots: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!grade) throw new NotFoundException('Grade not found');
    return grade;
  }

  /**
   * Get grade for a specific student + classLab combination.
   */
  async findByStudentAndClassLab(studentId: string, classLabId: string) {
    return this.prisma.labGrade.findUnique({
      where: {
        classLabId_studentId: { classLabId, studentId },
      },
      include: {
        checkpointSnapshots: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /**
   * List grades with filters and pagination.
   */
  async findAll(query: QueryGradesDto) {
    const { groupId, classLabId, studentId, status, page = 1, limit = 50 } = query;

    const where: any = {};
    if (groupId) where.groupId = groupId;
    if (classLabId) where.classLabId = classLabId;
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.labGrade.findMany({
        where,
        include: {
          checkpointSnapshots: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.labGrade.count({ where }),
    ]);

    return { items, pagination: buildPagination(page, limit, total) };
  }

  /**
   * Get all grades for students in a class (groupId), optionally filtered by classLabId.
   * Used by instructor/admin to see class-wide progress.
   */
  async getClassGrades(groupId: string, classLabId?: string) {
    const where: any = { groupId };
    if (classLabId) where.classLabId = classLabId;

    return this.prisma.labGrade.findMany({
      where,
      include: {
        checkpointSnapshots: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ studentId: 'asc' }, { classLabId: 'asc' }],
    });
  }

  /**
   * Get all grades for a specific student across all classLabs in a group.
   * Used by student to see their own progress in a class.
   */
  async getStudentGradesInGroup(studentId: string, groupId: string) {
    return this.prisma.labGrade.findMany({
      where: { studentId, groupId },
      include: {
        checkpointSnapshots: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Get class stats: average score, completion rate, etc.
   */
  async getClassStats(groupId: string, classLabId?: string) {
    const where: any = { groupId };
    if (classLabId) where.classLabId = classLabId;

    const grades = await this.prisma.labGrade.findMany({ where });

    const totalStudents = new Set(grades.map((g) => g.studentId)).size;
    const completedGrades = grades.filter((g) => g.status === 'COMPLETED' || g.status === 'GRADED');
    const avgPercentage = grades.length > 0
      ? Math.round(grades.reduce((sum, g) => sum + g.percentage, 0) / grades.length * 100) / 100
      : 0;
    const avgEarned = grades.length > 0
      ? Math.round(grades.reduce((sum, g) => sum + g.earnedPoints, 0) / grades.length * 100) / 100
      : 0;

    return {
      totalStudents,
      totalGrades: grades.length,
      completedCount: completedGrades.length,
      avgPercentage,
      avgEarnedPoints: avgEarned,
    };
  }
}
