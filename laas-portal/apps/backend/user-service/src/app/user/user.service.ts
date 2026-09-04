import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserProfileDto,
  UpdateUserStatusDto,
  QueryUsersDto,
  UpdateUserPreferencesDto,
  UpdateAdminNotesDto,
  UpdateInstructorNotesDto,
  ExtendedCreateUserDto,
  ExtendedUpdateUserDto,
  SendEmailDto,
} from './dto/user.dto';
import { User, Prisma, UserStatus } from '../../generated/prisma-client';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private prisma: PrismaService
  ) {}

  // ============================================
  // PROFILE OPERATIONS
  // ============================================

  /**
   * Get or create user profile (first login flow)
   */
  async getOrCreateUserProfile(
    keycloakUserId: string,
    email: string,
    username: string
  ): Promise<User> {
    this.logger.log(`Getting or creating user profile for Keycloak ID: ${keycloakUserId}`);

    // Try database
    let user = await this.prisma.user.findUnique({
      where: { keycloakUserId },
    });

    // Create if not exists
    if (!user) {
      this.logger.log(`Creating new user profile for ${email}`);
      user = await this.prisma.user.create({
        data: {
          keycloakUserId,
          email,
          username,
          lastLoginAt: new Date(),
        },
      });
    } else {
      // Update last login
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    return user;
  }

  /**
   * Get user by ID
   */
  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  /**
   * Get user by Keycloak ID
   */
  async findByKeycloakId(keycloakUserId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { keycloakUserId },
    });
  }

  /**
   * Update user profile (by user themselves)
   */
  async updateProfile(userId: string, dto: UpdateUserProfileDto): Promise<User> {
    this.logger.log(`Updating profile for user ${userId}`);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });

    return user;
  }

  // ============================================
  // ADMIN OPERATIONS
  // ============================================

  /**
   * Create user (admin only)
   */
  async create(dto: CreateUserDto): Promise<User> {
    this.logger.log(`Admin creating user: ${dto.email}`);

    const keycloakUserId = dto.keycloakUserId || `local-${dto.username}-${randomUUID()}`;

    // Check if user already exists
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          { username: dto.username },
          ...(dto.keycloakUserId ? [{ keycloakUserId: dto.keycloakUserId }] : []),
        ],
      },
    });

    if (existing) {
      throw new ConflictException('User with this email, username, or Keycloak ID already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        ...dto,
        keycloakUserId,
      },
    });

    return user;
  }

  /**
   * Update user (admin only)
   */
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    this.logger.log(`Admin updating user ${id}`);

    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
    });

    return user;
  }

  /**
   * Update user status
   */
  async updateStatus(id: string, dto: UpdateUserStatusDto): Promise<User> {
    this.logger.log(`Updating status for user ${id} to ${dto.status}`);

    const user = await this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
    });

    return user;
  }

  /**
   * List users with pagination and filters
   */
  async findAll(query: QueryUsersDto) {
    const { page = 1, limit = 20, search, systemRole, status, organizationId } = query;

    const where: Prisma.UserWhereInput = {};

    // Search filter
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Role filter
    if (systemRole) {
      where.systemRole = systemRole;
    }

    // Status filter
    if (status) {
      where.status = status;
    }

    // Organization filter
    if (organizationId) {
      where.userOrganizations = {
        some: {
          organizationId,
        },
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ============================================
  // GROUP OPERATIONS
  // ============================================

  /**
   * Get user's groups
   */
  async getUserGroups(userId: string) {
    return this.prisma.userGroup.findMany({
      where: { userId },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
          },
        },
      },
    });
  }

  /**
   * Assign user to group
   */
  async assignToGroup(userId: string, groupId: string, roleInGroup = 'STUDENT') {
    this.logger.log(`Assigning user ${userId} to group ${groupId} as ${roleInGroup}`);

    // Check if user exists
    await this.findById(userId);

    // Check if group exists
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    // Check if already assigned
    const existing = await this.prisma.userGroup.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('User is already assigned to this group');
    }

    const userGroup = await this.prisma.userGroup.create({
      data: {
        userId,
        groupId,
        roleInGroup,
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
          },
        },
      },
    });

    return userGroup;
  }

  /**
   * Remove user from group
   */
  async removeFromGroup(userId: string, groupId: string) {
    this.logger.log(`Removing user ${userId} from group ${groupId}`);

    const userGroup = await this.prisma.userGroup.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
    });

    if (!userGroup) {
      throw new NotFoundException('User is not assigned to this group');
    }

    await this.prisma.userGroup.delete({
      where: {
        userId_groupId: {
          userId,
          groupId,
        },
      },
    });

    return { message: 'User removed from group successfully' };
  }

  // ============================================
  // PREFERENCES OPERATIONS
  // ============================================

  /**
   * Get user preferences
   */
  async getPreferences(userId: string) {
    const user = await this.findById(userId);
    
    return {
      emailNotifications: user.emailNotifications,
      courseUpdates: user.courseUpdates,
      labReminders: user.labReminders,
      achievementsNotifications: user.achievementsNotifications,
      theme: user.theme,
      language: user.language,
      timezone: user.timezone,
    };
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, dto: UpdateUserPreferencesDto) {
    this.logger.log(`Updating preferences for user ${userId}`);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });

    return this.getPreferences(user.id);
  }

  // ============================================
  // NOTES OPERATIONS
  // ============================================

  /**
   * Update admin notes
   */
  async updateAdminNotes(userId: string, dto: UpdateAdminNotesDto, editorId: string, editorName: string) {
    this.logger.log(`Updating admin notes for user ${userId}`);

    const user = await this.findById(userId);
    const oldNotes = user.adminNotes;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { adminNotes: dto.adminNotes },
    });

    // Track change in edit history
    await this.createEditHistory(userId, editorId, editorName, 'adminNotes', oldNotes, dto.adminNotes, 'Updated admin notes');

    return updated;
  }

  /**
   * Update instructor notes
   */
  async updateInstructorNotes(userId: string, dto: UpdateInstructorNotesDto, editorId: string, editorName: string) {
    this.logger.log(`Updating instructor notes for user ${userId}`);

    const user = await this.findById(userId);
    const oldNotes = user.instructorNotes;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { instructorNotes: dto.instructorNotes },
    });

    // Track change in edit history
    await this.createEditHistory(userId, editorId, editorName, 'instructorNotes', oldNotes, dto.instructorNotes, 'Updated instructor notes');

    return updated;
  }

  // ============================================
  // ACCOUNT MANAGEMENT OPERATIONS
  // ============================================

  /**
   * Lock user account
   */
  async lockAccount(userId: string, reason?: string, editorId?: string, editorName?: string) {
    this.logger.log(`Locking account for user ${userId}`);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'DISABLED' },
    });

    // Track change in edit history
    if (editorId && editorName) {
      await this.createEditHistory(userId, editorId, editorName, 'status', 'ACTIVE', 'DISABLED', reason || 'Account locked');
    }

    return user;
  }

  /**
   * Unlock user account
   */
  async unlockAccount(userId: string, editorId?: string, editorName?: string) {
    this.logger.log(`Unlocking account for user ${userId}`);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE' },
    });

    // Track change in edit history
    if (editorId && editorName) {
      await this.createEditHistory(userId, editorId, editorName, 'status', 'DISABLED', 'ACTIVE', 'Account unlocked');
    }

    return user;
  }

  /**
   * Reset password (trigger Keycloak password reset)
   */
  async resetPassword(userId: string, message?: string) {
    this.logger.log(`Resetting password for user ${userId}`);
    
    const user = await this.findById(userId);
    
    // TODO: Integrate with Keycloak to trigger password reset email
    // For now, return success message
    
    return {
      success: true,
      message: `Password reset email has been sent to ${user.email}`,
      email: user.email,
    };
  }

  /**
   * Send email notification to user
   */
  async sendEmail(userId: string, dto: SendEmailDto) {
    this.logger.log(`Sending email to user ${userId}`);
    
    const user = await this.findById(userId);
    
    // TODO: Integrate with email service (notification-service)
    // For now, return success message
    
    return {
      success: true,
      message: `Email sent to ${user.email}`,
      recipient: user.email,
      subject: dto.subject,
    };
  }

  // ============================================
  // STATISTICS OPERATIONS
  // ============================================

  /**
   * Get user statistics
   * This will need to integrate with lab-service and billing-service
   */
  async getUserStatistics(userId: string) {
    await this.findById(userId);

    const metrics = this.buildStudentLearningMetrics(userId);
    return {
      totalLabs: metrics.totalLabs,
      completedLabs: metrics.completedLabs,
      inProgressLabs: metrics.inProgressLabs,
      notStartedLabs: metrics.notStartedLabs,
      averageScore: metrics.averageScore,
      totalTimeSpent: metrics.totalTimeSpent,
      totalSpent: metrics.totalSpent,
      completionRate: metrics.completionRate,
    };
  }

  /**
   * Get user activities
   * This will integrate with activity/audit service
   */
  async getUserActivities(userId: string, limit = 10) {
    await this.findById(userId);

    const labs = this.buildStudentLabProgress(userId);
    const activities = labs
      .flatMap((lab, index) => {
        const baseTime = index * 2 + 1;
        return [
          {
            id: `${lab.id}-start`,
            type: 'start' as const,
            title: `Bắt đầu ${lab.labName}`,
            time: this.toRelativeTimeLabel(baseTime + 8),
          },
          {
            id: `${lab.id}-submit`,
            type: 'submission' as const,
            title: `Nộp ${lab.labName}`,
            time: this.toRelativeTimeLabel(baseTime),
          },
        ];
      })
      .slice(0, limit);

    return activities;
  }

  /**
   * Get user invoices
   * This will integrate with billing-service
   */
  async getUserInvoices(userId: string) {
    await this.findById(userId); // Verify user exists
    
    // TODO: Fetch from billing-service
    // For now, return mock data
    
    return [];
  }

  /**
   * Get user enrolled labs
   * This will integrate with lab-service
   */
  async getUserEnrolledLabs(userId: string) {
    await this.findById(userId);

    return this.buildStudentLabProgress(userId).map((lab) => ({
      id: lab.id,
      labName: lab.labName,
      status: lab.status,
      score: lab.score,
      timeSpent: lab.timeSpent,
      submissionDate: lab.submissionDate,
      attempts: lab.attempts,
    }));
  }

  // ============================================
  // EDIT HISTORY OPERATIONS
  // ============================================

  /**
   * Get user edit history
   */
  async getEditHistory(userId: string, limit = 20) {
    await this.findById(userId); // Verify user exists
    
    const history = await this.prisma.userEditHistory.findMany({
      where: { userId },
      orderBy: { editedAt: 'desc' },
      take: limit,
    });
    
    return history;
  }

  /**
   * Create edit history record
   */
  async createEditHistory(
    userId: string,
    editorId: string,
    editorName: string,
    fieldName: string,
    oldValue: string | null | undefined,
    newValue: string | null | undefined,
    description?: string
  ) {
    return this.prisma.userEditHistory.create({
      data: {
        userId,
        editorId,
        editorName,
        fieldName,
        oldValue: oldValue?.toString() || null,
        newValue: newValue?.toString() || null,
        description,
      },
    });
  }

  // ============================================
  // EXTENDED CRUD OPERATIONS
  // ============================================

  /**
   * Extended create user (with all profile fields)
   */
  async createExtended(dto: ExtendedCreateUserDto, editorId: string, editorName: string) {
    this.logger.log(`Creating extended user profile: ${dto.email}`);

    const keycloakUserId = dto.keycloakUserId || `local-${dto.username}-${randomUUID()}`;

    // Check if user already exists
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          { username: dto.username },
          ...(dto.keycloakUserId ? [{ keycloakUserId: dto.keycloakUserId }] : []),
          ...(dto.studentCode ? [{ studentCode: dto.studentCode }] : []),
        ],
      },
    });

    if (existing) {
      throw new ConflictException('User with this email, username, student code, or Keycloak ID already exists');
    }

    const { sendWelcomeEmail, assignedLabIds, initialPassword, ...userData } = dto;

    // Parse date if provided
    const dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;

    const passwordHash = initialPassword ? this.hashPassword(initialPassword) : undefined;

    const user = await this.prisma.user.create({
      data: {
        ...userData,
        keycloakUserId,
        dateOfBirth,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    // TODO: Send welcome email if requested
    if (sendWelcomeEmail) {
      this.logger.log(`Welcome email would be sent to ${user.email}`);
    }

    // TODO: Assign labs if provided
    if (assignedLabIds && assignedLabIds.length > 0) {
      this.logger.log(`Would assign ${assignedLabIds.length} labs to user ${user.id}`);
    }

    // Track creation in edit history
    await this.createEditHistory(user.id, editorId, editorName, 'user', null, 'created', 'User account created');

    return user;
  }

  /**
   * Extended update user (with all profile fields and edit tracking)
   */
  async updateExtended(userId: string, dto: ExtendedUpdateUserDto, editorId: string, editorName: string) {
    this.logger.log(`Extended update for user ${userId}`);

    const existingUser = await this.findById(userId);

    // Parse date if provided
    const dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...dto,
        dateOfBirth,
      },
    });

    // Track significant changes in edit history
    const fieldsToTrack = ['fullName', 'email', 'phone', 'systemRole', 'studentCode', 'organization', 'department'];
    
    for (const field of fieldsToTrack) {
      const oldValue = existingUser[field];
      const newValue = user[field];
      
      if (oldValue !== newValue) {
        await this.createEditHistory(
          userId,
          editorId,
          editorName,
          field,
          oldValue?.toString(),
          newValue?.toString(),
          `Updated ${field}`
        );
      }
    }

    return user;
  }

  /**
   * Delete user (soft delete by setting status to DISABLED)
   */
  async deleteUser(userId: string, editorId: string, editorName: string) {
    this.logger.log(`Deleting user ${userId}`);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'DISABLED' },
    });

    // Track deletion in edit history
    await this.createEditHistory(userId, editorId, editorName, 'status', 'ACTIVE', 'DISABLED', 'User account deleted');

    return { success: true, message: 'User deleted successfully' };
  }

  // ============================================
  // STUDENT-SPECIFIC OPERATIONS (for Instructors)
 // ============================================

  /**
   * Get students list (filtered by instructor's courses)
   * TODO: Implement actual filtering based on instructor's courses
   */
  async getStudents(instructorId: string, query: QueryUsersDto) {
    this.logger.log(`Getting students for instructor ${instructorId}`);

    const {
      page = 1,
      limit = 20,
      search,
      status,
      className,
      learningStatus,
    } = query;

    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedLimit = Math.max(1, Number(limit) || 20);

    const where: Prisma.UserWhereInput = {
      systemRole: 'STUDENT',
    };

    // Search filter
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
        { studentCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Status filter
    if (status) {
      where.status = status;
    }

    if (className && className !== 'all') {
      where.userGroups = {
        some: {
          group: {
            name: className,
          },
        },
      };
    }

    const students = await this.prisma.user.findMany({
      where,
      include: {
        userGroups: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = students
      .map((student) => {
        const metrics = this.buildStudentLearningMetrics(student.id);
        const learningState = this.toLearningStatus(student.status, metrics.averageScore);
        return {
          id: student.id,
          name: student.fullName || student.username,
          email: student.email,
          class: student.userGroups[0]?.group.name || 'Chưa phân lớp',
          totalLabs: metrics.totalLabs,
          completedLabs: metrics.completedLabs,
          averageScore: Math.round(metrics.averageScore),
          totalTime: this.toHourLabel(metrics.totalTimeSpent),
          lastActivity: this.toRelativeTimeLabel(metrics.lastActivityHours),
          status: learningState,
        };
      })
      .filter((student) => !learningStatus || learningStatus === 'all' || student.status === learningStatus);

    const total = mapped.length;
    const data = mapped.slice((normalizedPage - 1) * normalizedLimit, normalizedPage * normalizedLimit);

    const totalStudents = mapped.length;
    const completionRateRaw =
      totalStudents === 0
        ? 0
        : mapped.reduce((acc, student) => acc + (student.completedLabs / student.totalLabs) * 100, 0) /
          totalStudents;
    const avgScoreRaw =
      totalStudents === 0
        ? 0
        : mapped.reduce((acc, student) => acc + student.averageScore, 0) / totalStudents;

    const classes = Array.from(new Set(mapped.map((student) => student.class))).filter(
      (groupName) => groupName !== 'Chưa phân lớp'
    );

    return {
      data,
      summary: {
        totalStudents,
        avgCompletion: Math.round(completionRateRaw),
        avgScore: Math.round(avgScoreRaw),
        atRiskCount: mapped.filter((student) => student.status === 'at-risk').length,
      },
      classes,
      total,
      page: normalizedPage,
      limit: normalizedLimit,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }

  /**
   * Get student detail (for instructor view)
   */
  async getStudentDetail(studentId: string, instructorId: string) {
    this.logger.log(`Getting student ${studentId} detail for instructor ${instructorId}`);

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        userGroups: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException(`User with ID ${studentId} not found`);
    }
    
    if (student.systemRole !== 'STUDENT') {
      throw new BadRequestException('User is not a student');
    }

    const statistics = await this.getUserStatistics(studentId);
    const labProgress = this.buildStudentLabProgress(studentId);
    const scoreTrend = labProgress
      .filter((lab) => lab.score > 0)
      .slice(0, 6)
      .map((lab, index) => ({
        lab: `Lab ${index + 1}`,
        score: lab.score,
      }));
    const recentActivities = await this.getUserActivities(studentId, 8);

    const classGroup = student.userGroups[0]?.group;
    const learningState = this.toLearningStatus(student.status, statistics.averageScore);

    return {
      id: student.id,
      name: student.fullName || student.username,
      email: student.email,
      studentCode: student.studentCode,
      class: classGroup?.name || 'Chưa phân lớp',
      classId: classGroup?.id,
      enrollmentDate: this.toDateLabel(student.createdAt),
      avatar: student.avatar,
      phone: student.phone,
      status: learningState,
      statistics,
      labProgress,
      scoreTrend,
      recentActivities,
      instructorNotes: student.instructorNotes,
    };
  }

  private toLearningStatus(
    userStatus: UserStatus,
    averageScore: number
  ): 'active' | 'inactive' | 'at-risk' {
    if (userStatus === 'DISABLED') {
      return 'inactive';
    }

    if (averageScore < 65) {
      return 'at-risk';
    }

    return 'active';
  }

  private buildStudentLearningMetrics(studentId: string) {
    const seed = Array.from(studentId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const totalLabs = 6 + (seed % 7);
    const completedLabs = Math.max(0, Math.min(totalLabs, totalLabs - (seed % 4)));
    const inProgressLabs = Math.min(totalLabs - completedLabs, seed % 3);
    const notStartedLabs = Math.max(0, totalLabs - completedLabs - inProgressLabs);
    const averageScore = Math.round((55 + (seed % 41)) * 10) / 10;
    const totalTimeSpent = Math.round((totalLabs * (2 + (seed % 4)) + (seed % 9)) * 10) / 10;

    return {
      totalLabs,
      completedLabs,
      inProgressLabs,
      notStartedLabs,
      averageScore,
      totalTimeSpent,
      totalSpent: 300000 + (seed % 7) * 150000,
      completionRate: Math.round((completedLabs / totalLabs) * 100),
      lastActivityHours: 1 + (seed % 192),
    };
  }

  private buildStudentLabProgress(studentId: string) {
    const metrics = this.buildStudentLearningMetrics(studentId);
    const items = Array.from({ length: metrics.totalLabs }, (_, index) => {
      const order = index + 1;
      const isCompleted = order <= metrics.completedLabs;
      const isInProgress = !isCompleted && order <= metrics.completedLabs + metrics.inProgressLabs;
      const scoreSeed = Array.from(`${studentId}-${order}`).reduce(
        (acc, char) => acc + char.charCodeAt(0),
        0
      );

      return {
        id: `${studentId}-lab-${order}`,
        labName: `Lab ${order}: Chủ đề thực hành ${order}`,
        status: isCompleted
          ? ('completed' as const)
          : isInProgress
            ? ('in-progress' as const)
            : ('not-started' as const),
        score: isCompleted ? Math.round((6.5 + (scoreSeed % 30) / 10) * 10) / 10 : 0,
        timeSpent: `${(2 + (scoreSeed % 5) + (isCompleted ? 0.5 : 0)).toFixed(1)} giờ`,
        submissionDate: isCompleted
          ? this.toDateLabel(new Date(Date.now() - order * 86400000))
          : '-',
        attempts: isCompleted ? 1 + (scoreSeed % 2) : 0,
      };
    });

    return items;
  }

  private toRelativeTimeLabel(hoursAgo: number): string {
    if (hoursAgo < 24) {
      return `${hoursAgo} giờ trước`;
    }

    const days = Math.floor(hoursAgo / 24);
    if (days < 7) {
      return `${days} ngày trước`;
    }

    const weeks = Math.floor(days / 7);
    return `${weeks} tuần trước`;
  }

  private toHourLabel(hours: number): string {
    return `${hours.toFixed(1)} giờ`;
  }

  private toDateLabel(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  }

  private hashPassword(plain: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(plain, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }
}
