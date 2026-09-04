import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SystemRole, UserStatus } from '../../../generated/prisma-client';

// ============================================
// UPDATE USER PROFILE DTO
// ============================================

export class UpdateUserProfileDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ example: '+84901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'en', description: 'Language code (en, vi, etc.)' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'STD-001' })
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiPropertyOptional({ example: 'Computer Science' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'Robusta Technology' })
  @IsOptional()
  @IsString()
  organization?: string;

  @ApiPropertyOptional({ example: 'Passionate about cloud architecture...' })
  @IsOptional()
  @IsString()
  bio?: string;
}

// ============================================
// CREATE USER DTO (Admin only)
// ============================================

export class CreateUserDto {
  @ApiPropertyOptional({ example: 'keycloak-uuid-123' })
  @IsOptional()
  @IsString()
  keycloakUserId?: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'johndoe' })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ enum: SystemRole, default: SystemRole.STUDENT })
  @IsOptional()
  @IsEnum(SystemRole)
  systemRole?: SystemRole;
}

// ============================================
// UPDATE USER DTO (Admin only)
// ============================================

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ example: '+84901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: SystemRole })
  @IsOptional()
  @IsEnum(SystemRole)
  systemRole?: SystemRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

// ============================================
// UPDATE USER STATUS DTO
// ============================================

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  @IsNotEmpty()
  @IsEnum(UserStatus)
  status: UserStatus;
}

// ============================================
// ASSIGN USER TO GROUP DTO
// ============================================

export class AssignUserToGroupDto {
  @ApiProperty({ example: 'uuid-of-group' })
  @IsNotEmpty()
  @IsUUID()
  groupId: string;

  @ApiPropertyOptional({ example: 'STUDENT', default: 'STUDENT' })
  @IsOptional()
  @IsString()
  roleInGroup?: string;
}

// ============================================
// QUERY DTOs
// ============================================

export class QueryUsersDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'john' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SystemRole })
  @IsOptional()
  @IsEnum(SystemRole)
  systemRole?: SystemRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'uuid-of-organization' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({
    example: 'DevOps 2024A',
    description: 'Filter students by class/group name (Instructor UI)',
  })
  @IsOptional()
  @IsString()
  className?: string;

  @ApiPropertyOptional({
    example: 'at-risk',
    enum: ['active', 'inactive', 'at-risk'],
    description: 'Learning status filter used by Instructor UI',
  })
  @IsOptional()
  @IsString()
  learningStatus?: 'active' | 'inactive' | 'at-risk';
}

// ============================================
// UPDATE USER PREFERENCES DTO
// ============================================

export class UpdateUserPreferencesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  emailNotifications?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  courseUpdates?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  labReminders?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  achievementsNotifications?: boolean;

  @ApiPropertyOptional({ example: 'light', enum: ['light', 'dark'] })
  @IsOptional()
  @IsString()
  theme?: string;

  @ApiPropertyOptional({ example: 'en', description: 'Language code (en, vi, etc.)' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

// ============================================
// UPDATE ADMIN NOTES DTO
// ============================================

export class UpdateAdminNotesDto {
  @ApiProperty({ example: 'Student is doing well in class...' })
  @IsNotEmpty()
  @IsString()
  adminNotes: string;
}

// ============================================
// UPDATE INSTRUCTOR NOTES DTO
// ============================================

export class UpdateInstructorNotesDto {
  @ApiProperty({ example: 'Excellent progress on lab assignments...' })
  @IsNotEmpty()
  @IsString()
  instructorNotes: string;
}

// ============================================
// LOCK/UNLOCK ACCOUNT DTO
// ============================================

export class LockAccountDto {
  @ApiPropertyOptional({ example: 'Suspicious activity detected' })
  @IsOptional()
  @IsString()
  reason?: string;
}

// ============================================
// RESET PASSWORD DTO
// ============================================

export class ResetPasswordDto {
  @ApiPropertyOptional({ example: 'Please reset your password for security' })
  @IsOptional()
  @IsString()
  message?: string;
}

// ============================================
// SEND EMAIL DTO
// ============================================

export class SendEmailDto {
  @ApiProperty({ example: 'Important Update' })
  @IsNotEmpty()
  @IsString()
  subject: string;

  @ApiProperty({ example: 'This is an important message...' })
  @IsNotEmpty()
  @IsString()
  body: string;
}

// ============================================
// EXTENDED CREATE USER DTO
// ============================================

export class ExtendedCreateUserDto extends CreateUserDto {
  @ApiPropertyOptional({ example: '+84901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '2000-01-01' })
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'male', enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: '123 Main St, City, Country' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '22127001' })
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiPropertyOptional({ example: 'University of Science' })
  @IsOptional()
  @IsString()
  organization?: string;

  @ApiPropertyOptional({ example: 'Computer Science' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ example: 'Internal admin note' })
  @IsOptional()
  @IsString()
  adminNotes?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  sendWelcomeEmail?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['lab-uuid-1', 'lab-uuid-2'] })
  @IsOptional()
  assignedLabIds?: string[];

  @ApiPropertyOptional({ example: 'SecureP@ss123', description: 'Initial password for the new account (min 8 chars)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  initialPassword?: string;
}

// ============================================
// EXTENDED UPDATE USER DTO
// ============================================

export class ExtendedUpdateUserDto extends UpdateUserDto {
  @ApiPropertyOptional({ example: '2000-01-01' })
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'male', enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: '123 Main St, City, Country' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'A motivated student...' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: '22127001' })
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiPropertyOptional({ example: 'University of Science' })
  @IsOptional()
  @IsString()
  organization?: string;

  @ApiPropertyOptional({ example: 'Computer Science' })
  @IsOptional()
  @IsString()
  department?: string;
}
