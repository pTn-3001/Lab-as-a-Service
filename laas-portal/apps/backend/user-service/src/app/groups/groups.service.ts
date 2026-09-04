import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { Prisma } from '../../generated/prisma-client';

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  /**
   * Create a new group, optionally assigning an instructor and students.
   */
  async create(dto: CreateGroupDto, currentUserId: string) {
    this.logger.log(`Creating group: ${dto.name} (${dto.code})`);

    const { instructorId, studentIds, startDate, endDate, ...groupData } = dto;

    const group = await this.prisma.group.create({
      data: {
        ...groupData,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });

    // Assign instructor if provided
    if (instructorId) {
      await this.prisma.userGroup.create({
        data: {
          userId: instructorId,
          groupId: group.id,
          roleInGroup: 'INSTRUCTOR',
        },
      });
      this.logger.log(`Assigned instructor ${instructorId} to group ${group.id}`);
    }

    // Enroll students if provided
    if (studentIds && studentIds.length > 0) {
      await this.prisma.userGroup.createMany({
        data: studentIds.map((userId) => ({
          userId,
          groupId: group.id,
          roleInGroup: 'STUDENT',
        })),
        skipDuplicates: true,
      });
      this.logger.log(`Enrolled ${studentIds.length} students in group ${group.id}`);
    }

    // Return the created group with relations
    return this.findById(group.id);
  }

  /**
   * Paginated list of groups with search and filter support.
   */
  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: string;
  }) {
    const { page = 1, limit = 20, search, isActive } = query;
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedLimit = Math.max(1, Math.min(100, Number(limit) || 20));

    const where: Prisma.GroupWhereInput = {};

    // Search by name or code
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filter by isActive
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [data, total] = await Promise.all([
      this.prisma.group.findMany({
        where,
        skip: (normalizedPage - 1) * normalizedLimit,
        take: normalizedLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: {
            select: { id: true, name: true, code: true },
          },
          userGroups: {
            where: { roleInGroup: 'INSTRUCTOR' },
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  avatar: true,
                },
              },
            },
            take: 1,
          },
          _count: {
            select: {
              userGroups: {
                where: { roleInGroup: 'STUDENT' },
              },
            },
          },
        },
      }),
      this.prisma.group.count({ where }),
    ]);

    const transformedData = data.map((group) => {
      const { userGroups, _count, ...rest } = group;
      return {
        ...rest,
        instructor: userGroups[0]?.user ?? null,
        _count: { students: _count?.userGroups ?? 0 },
      };
    });

    return {
      data: transformedData,
      total,
      page: normalizedPage,
      limit: normalizedLimit,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }

  /**
   * Get a single group by ID with full details.
   */
  async findById(id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, code: true },
        },
        userGroups: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                username: true,
                avatar: true,
                studentCode: true,
                systemRole: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        _count: {
          select: {
            userGroups: {
              where: { roleInGroup: 'STUDENT' },
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    const { _count, userGroups, ...rest } = group;
    const instructor = userGroups.find((ug) => ug.user.systemRole === 'INSTRUCTOR' || ug.roleInGroup === 'INSTRUCTOR')?.user ?? null;
    const students = userGroups
      .filter((ug) => ug.roleInGroup === 'STUDENT')
      .map((ug) => ({ ...ug.user, joinedAt: ug.joinedAt }));
    return {
      ...rest,
      instructor,
      students,
      _count: { students: _count?.userGroups ?? 0 },
    };
  }

  /**
   * Find groups where the user is a member.
   * Filters by roleInGroup if a role is specified.
   */
  async findMyClasses(userId: string, role?: string) {
    const whereUserGroup: Prisma.UserGroupWhereInput = { userId };

    if (role === 'INSTRUCTOR') {
      whereUserGroup.roleInGroup = 'INSTRUCTOR';
    } else if (role === 'STUDENT') {
      whereUserGroup.roleInGroup = 'STUDENT';
    }

    const userGroups = await this.prisma.userGroup.findMany({
      where: whereUserGroup,
      include: {
        group: {
          include: {
            organization: {
              select: { id: true, name: true, code: true },
            },
            userGroups: {
              where: { roleInGroup: 'INSTRUCTOR' },
              include: {
                user: { select: { id: true, fullName: true, email: true, avatar: true } },
              },
              take: 1,
            },
            _count: {
              select: {
                userGroups: { where: { roleInGroup: 'STUDENT' } },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return userGroups.map((ug) => {
      const { _count, userGroups: groupUsers, ...groupRest } = ug.group;
      return {
        ...groupRest,
        instructor: groupUsers[0]?.user ?? null,
        _count: { students: _count?.userGroups ?? 0 },
        roleInGroup: ug.roleInGroup,
        joinedAt: ug.joinedAt,
      };
    });
  }

  /**
   * Update group fields.
   */
  async update(id: string, dto: UpdateGroupDto) {
    this.logger.log(`Updating group ${id}`);

    // Verify group exists
    await this.findById(id);

    const { startDate, endDate, ...rest } = dto;

    const group = await this.prisma.group.update({
      where: { id },
      data: {
        ...rest,
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      },
      include: {
        organization: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return group;
  }

  /**
   * Soft-delete a group by setting isActive to false.
   */
  async softDelete(id: string) {
    this.logger.log(`Soft-deleting group ${id}`);

    // Verify group exists
    await this.findById(id);

    const group = await this.prisma.group.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true, message: 'Group deactivated successfully', group };
  }

  // ============================================
  // STUDENT MANAGEMENT
  // ============================================

  /**
   * Batch-add students to a group.
   */
  async addStudents(groupId: string, studentIds: string[]) {
    this.logger.log(`Adding ${studentIds.length} students to group ${groupId}`);

    // Verify group exists
    await this.findById(groupId);

    const result = await this.prisma.userGroup.createMany({
      data: studentIds.map((userId) => ({
        userId,
        groupId,
        roleInGroup: 'STUDENT',
      })),
      skipDuplicates: true,
    });

    return {
      success: true,
      message: `${result.count} student(s) added to the group`,
      addedCount: result.count,
    };
  }

  /**
   * Remove a single student from a group.
   */
  async removeStudent(groupId: string, studentId: string) {
    this.logger.log(`Removing student ${studentId} from group ${groupId}`);

    const userGroup = await this.prisma.userGroup.findUnique({
      where: {
        userId_groupId: {
          userId: studentId,
          groupId,
        },
      },
    });

    if (!userGroup) {
      throw new NotFoundException('Student is not a member of this group');
    }

    await this.prisma.userGroup.delete({
      where: {
        userId_groupId: {
          userId: studentId,
          groupId,
        },
      },
    });

    return { success: true, message: 'Student removed from group successfully' };
  }

  // ============================================
  // INSTRUCTOR MANAGEMENT
  // ============================================

  /**
   * Assign or replace the instructor for a group.
   * Removes any existing INSTRUCTOR entries, then creates a new one.
   */
  async assignInstructor(groupId: string, instructorId: string) {
    this.logger.log(`Assigning instructor ${instructorId} to group ${groupId}`);

    // Verify group exists
    await this.findById(groupId);

    // Remove existing instructor(s)
    await this.prisma.userGroup.deleteMany({
      where: {
        groupId,
        roleInGroup: 'INSTRUCTOR',
      },
    });

    // Create new instructor assignment
    const userGroup = await this.prisma.userGroup.create({
      data: {
        userId: instructorId,
        groupId,
        roleInGroup: 'INSTRUCTOR',
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Instructor assigned successfully',
      instructor: userGroup.user,
    };
  }

  /**
   * Paginated list of students in a group.
   */
  async getStudents(groupId: string, query: { page?: number; limit?: number; search?: string }) {
    const { page = 1, limit = 20, search } = query;
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedLimit = Math.max(1, Math.min(100, Number(limit) || 20));

    // Verify group exists
    await this.findById(groupId);

    const where: Prisma.UserGroupWhereInput = {
      groupId,
      roleInGroup: 'STUDENT',
    };

    // Optional search within student name/email
    if (search) {
      where.user = {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { username: { contains: search, mode: 'insensitive' } },
          { studentCode: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.userGroup.findMany({
        where,
        skip: (normalizedPage - 1) * normalizedLimit,
        take: normalizedLimit,
        orderBy: { joinedAt: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              username: true,
              avatar: true,
              studentCode: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.userGroup.count({ where }),
    ]);

    const students = data.map((ug) => ({
      ...ug.user,
      joinedAt: ug.joinedAt,
      userGroupId: ug.id,
    }));

    return {
      data: students,
      total,
      page: normalizedPage,
      limit: normalizedLimit,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }
}
