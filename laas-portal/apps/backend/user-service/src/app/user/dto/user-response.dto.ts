import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SystemRole, UserStatus } from '../../../generated/prisma-client';

// ============================================
// USER RESPONSE DTO
// ============================================

export class UserResponseDto {
  @ApiProperty({ example: 'uuid-123' })
  id: string;

  @ApiProperty({ example: 'keycloak-uuid-456' })
  keycloakUserId: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email: string;

  @ApiProperty({ example: 'johndoe' })
  username: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  fullName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  avatar?: string;

  @ApiPropertyOptional({ example: '+84901234567' })
  phone?: string;

  @ApiProperty({ example: 'en' })
  language: string;

  @ApiProperty({ example: 'UTC' })
  timezone: string;

  @ApiProperty({ enum: SystemRole, example: SystemRole.STUDENT })
  systemRole: SystemRole;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status: UserStatus;

  @ApiPropertyOptional()
  lastLoginAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// ============================================
// PAGINATED USERS RESPONSE
// ============================================

export class PaginatedUsersResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  data: UserResponseDto[];

  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

// ============================================
// USER GROUP RESPONSE DTO
// ============================================

export class UserGroupResponseDto {
  @ApiProperty({ example: 'uuid-123' })
  id: string;

  @ApiProperty({ example: 'uuid-group' })
  groupId: string;

  @ApiProperty({ example: 'STUDENT' })
  roleInGroup: string;

  @ApiProperty()
  joinedAt: Date;

  @ApiPropertyOptional()
  group?: {
    id: string;
    name: string;
    code: string;
    type: string;
  };
}

// ============================================
// EXTENDED USER RESPONSE DTO
// ============================================

export class ExtendedUserResponseDto extends UserResponseDto {
  @ApiPropertyOptional({ example: '2000-01-01' })
  dateOfBirth?: Date;

  @ApiPropertyOptional({ example: 'male' })
  gender?: string;

  @ApiPropertyOptional({ example: '123 Main St' })
  address?: string;

  @ApiPropertyOptional({ example: 'A motivated student...' })
  bio?: string;

  @ApiPropertyOptional({ example: '22127001' })
  studentCode?: string;

  @ApiPropertyOptional({ example: 'University of Science' })
  organization?: string;

  @ApiPropertyOptional({ example: 'Computer Science' })
  department?: string;

  @ApiPropertyOptional({ example: true })
  emailNotifications?: boolean;

  @ApiPropertyOptional({ example: true })
  courseUpdates?: boolean;

  @ApiPropertyOptional({ example: true })
  labReminders?: boolean;

  @ApiPropertyOptional({ example: true })
  achievementsNotifications?: boolean;

  @ApiPropertyOptional({ example: 'light' })
  theme?: string;

  @ApiPropertyOptional({ example: 'Private admin notes...' })
  adminNotes?: string;

  @ApiPropertyOptional({ example: 'Instructor observations...' })
  instructorNotes?: string;
}

// ============================================
// USER STATISTICS DTO
// ============================================

export class UserStatisticsDto {
  @ApiProperty({ example: 10 })
  totalLabs: number;

  @ApiProperty({ example: 7 })
  completedLabs: number;

  @ApiProperty({ example: 2 })
  inProgressLabs: number;

  @ApiProperty({ example: 1 })
  notStartedLabs: number;

  @ApiProperty({ example: 85.5 })
  averageScore: number;

  @ApiProperty({ example: 120.5 })
  totalTimeSpent: number;

  @ApiProperty({ example: 1500000 })
  totalSpent: number;

  @ApiProperty({ example: 70 })
  completionRate: number;
}

// ============================================
// USER EDIT HISTORY DTO
// ============================================

export class UserEditHistoryDto {
  @ApiProperty({ example: 'uuid-123' })
  id: string;

  @ApiProperty({ example: 'admin-uuid' })
  editorId: string;

  @ApiProperty({ example: 'Admin John' })
  editorName: string;

  @ApiProperty({ example: 'fullName' })
  fieldName: string;

  @ApiPropertyOptional({ example: 'Old Name' })
  oldValue?: string;

  @ApiPropertyOptional({ example: 'New Name' })
  newValue?: string;

  @ApiPropertyOptional({ example: 'Updated user full name' })
  description?: string;

  @ApiProperty()
  editedAt: Date;
}

// ============================================
// USER PREFERENCES RESPONSE DTO
// ============================================

export class UserPreferencesDto {
  @ApiProperty({ example: true })
  emailNotifications: boolean;

  @ApiProperty({ example: true })
  courseUpdates: boolean;

  @ApiProperty({ example: true })
  labReminders: boolean;

  @ApiProperty({ example: true })
  achievementsNotifications: boolean;

  @ApiProperty({ example: 'light' })
  theme: string;

  @ApiProperty({ example: 'en' })
  language: string;

  @ApiProperty({ example: 'UTC' })
  timezone: string;
}

// ============================================
// STUDENT DETAIL RESPONSE (For Instructor)
// ============================================

export class StudentDetailResponseDto extends ExtendedUserResponseDto {
  @ApiPropertyOptional()
  statistics?: UserStatisticsDto;

  @ApiPropertyOptional({ type: [Object] })
  enrolledLabs?: any[];

  @ApiPropertyOptional({ type: [Object] })
  recentActivities?: any[];
}

export class InstructorStudentListItemDto {
  @ApiProperty({ example: 'uuid-123' })
  id: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  name: string;

  @ApiProperty({ example: 'nguyenvana@student.edu' })
  email: string;

  @ApiProperty({ example: 'DevOps 2024A' })
  class: string;

  @ApiProperty({ example: 8 })
  totalLabs: number;

  @ApiProperty({ example: 6 })
  completedLabs: number;

  @ApiProperty({ example: 82 })
  averageScore: number;

  @ApiProperty({ example: '32 giờ' })
  totalTime: string;

  @ApiProperty({ example: '2 giờ trước' })
  lastActivity: string;

  @ApiProperty({ enum: ['active', 'inactive', 'at-risk'], example: 'active' })
  status: 'active' | 'inactive' | 'at-risk';
}

export class InstructorStudentsSummaryDto {
  @ApiProperty({ example: 35 })
  totalStudents: number;

  @ApiProperty({ example: 78 })
  avgCompletion: number;

  @ApiProperty({ example: 80 })
  avgScore: number;

  @ApiProperty({ example: 4 })
  atRiskCount: number;
}

export class InstructorStudentsResponseDto {
  @ApiProperty({ type: [InstructorStudentListItemDto] })
  data: InstructorStudentListItemDto[];

  @ApiProperty({ type: InstructorStudentsSummaryDto })
  summary: InstructorStudentsSummaryDto;

  @ApiProperty({ type: [String], example: ['DevOps 2024A', 'DevOps 2024B'] })
  classes: string[];

  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 6 })
  totalPages: number;
}

export class StudentLabProgressItemDto {
  @ApiProperty({ example: 'lab-1' })
  id: string;

  @ApiProperty({ example: 'Lab 1: SQL Basics' })
  labName: string;

  @ApiProperty({ enum: ['completed', 'in-progress', 'not-started'], example: 'completed' })
  status: 'completed' | 'in-progress' | 'not-started';

  @ApiProperty({ example: 8.2 })
  score: number;

  @ApiProperty({ example: '3.5 giờ' })
  timeSpent: string;

  @ApiProperty({ example: '14/09/2024' })
  submissionDate: string;

  @ApiProperty({ example: 1 })
  attempts: number;
}

export class StudentScoreTrendItemDto {
  @ApiProperty({ example: 'Lab 1' })
  lab: string;

  @ApiProperty({ example: 8.5 })
  score: number;
}

export class StudentActivityItemDto {
  @ApiProperty({ example: 'activity-1' })
  id: string;

  @ApiProperty({ enum: ['submission', 'completion', 'start'], example: 'submission' })
  type: 'submission' | 'completion' | 'start';

  @ApiProperty({ example: 'Nộp Lab 3' })
  title: string;

  @ApiProperty({ example: '2 giờ trước' })
  time: string;
}

export class InstructorStudentDetailResponseDto {
  @ApiProperty({ example: 'SV001' })
  id: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  name: string;

  @ApiProperty({ example: 'nguyenvana@student.hcmus.edu.vn' })
  email: string;

  @ApiPropertyOptional({ example: '22127001' })
  studentCode?: string;

  @ApiProperty({ example: 'DevOps 2024A' })
  class: string;

  @ApiPropertyOptional({ example: 'group-uuid' })
  classId?: string;

  @ApiProperty({ example: '01/09/2024' })
  enrollmentDate: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  avatar?: string;

  @ApiPropertyOptional({ example: '+84 912 345 678' })
  phone?: string;

  @ApiProperty({ enum: ['active', 'inactive', 'at-risk'], example: 'active' })
  status: 'active' | 'inactive' | 'at-risk';

  @ApiProperty({ type: UserStatisticsDto })
  statistics: UserStatisticsDto;

  @ApiProperty({ type: [StudentLabProgressItemDto] })
  labProgress: StudentLabProgressItemDto[];

  @ApiProperty({ type: [StudentScoreTrendItemDto] })
  scoreTrend: StudentScoreTrendItemDto[];

  @ApiProperty({ type: [StudentActivityItemDto] })
  recentActivities: StudentActivityItemDto[];

  @ApiPropertyOptional({ example: 'Học viên có tiến độ tốt...' })
  instructorNotes?: string;
}
