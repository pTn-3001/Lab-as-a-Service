import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import {
  UpdateUserProfileDto,
  UpdateUserStatusDto,
  AssignUserToGroupDto,
  QueryUsersDto,
  UpdateUserPreferencesDto,
  UpdateAdminNotesDto,
  UpdateInstructorNotesDto,
  ExtendedCreateUserDto,
  ExtendedUpdateUserDto,
  LockAccountDto,
  ResetPasswordDto,
  SendEmailDto,
} from './dto/user.dto';
import {
  UserResponseDto,
  PaginatedUsersResponseDto,
  UserGroupResponseDto,
  ExtendedUserResponseDto,
  UserStatisticsDto,
  UserEditHistoryDto,
  UserPreferencesDto,
  StudentDetailResponseDto,
  InstructorStudentsResponseDto,
  InstructorStudentDetailResponseDto,
} from './dto/user-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ============================================
  // PROFILE ENDPOINTS
  // ============================================

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile', type: UserResponseDto })
  async getMyProfile(@CurrentUser() jwtUser: JwtUser): Promise<UserResponseDto> {
    const user = await this.userService.findById(jwtUser.sub);
    return user as UserResponseDto;
  }

  @Put('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully', type: UserResponseDto })
  async updateMyProfile(
    @CurrentUser() jwtUser: JwtUser,
    @Body() dto: UpdateUserProfileDto
  ): Promise<UserResponseDto> {
    const updated = await this.userService.updateProfile(jwtUser.sub, dto);
    return updated as UserResponseDto;
  }

  @Get('me/groups')
  @ApiOperation({ summary: 'Get current user groups' })
  @ApiResponse({ status: 200, description: 'User groups', type: [UserGroupResponseDto] })
  async getMyGroups(@CurrentUser() jwtUser: JwtUser): Promise<UserGroupResponseDto[]> {
    const groups = await this.userService.getUserGroups(jwtUser.sub);
    return groups as UserGroupResponseDto[];
  }

  @Get('me/preferences')
  @ApiOperation({ summary: 'Get current user preferences' })
  @ApiResponse({ status: 200, description: 'User preferences', type: UserPreferencesDto })
  async getMyPreferences(@CurrentUser() jwtUser: JwtUser): Promise<UserPreferencesDto> {
    return this.userService.getPreferences(jwtUser.sub);
  }

  @Put('me/preferences')
  @ApiOperation({ summary: 'Update current user preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully', type: UserPreferencesDto })
  async updateMyPreferences(
    @CurrentUser() jwtUser: JwtUser,
    @Body() dto: UpdateUserPreferencesDto
  ): Promise<UserPreferencesDto> {
    return this.userService.updatePreferences(jwtUser.sub, dto);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'List all users (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of users',
    type: PaginatedUsersResponseDto,
  })
  async findAll(@Query() query: QueryUsersDto): Promise<PaginatedUsersResponseDto> {
    return this.userService.findAll(query);
  }

  @Get(':id')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Get user by ID (Admin/Instructor only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User details',
    type: ExtendedUserResponseDto,
  })
  async findOne(@Param('id') id: string): Promise<ExtendedUserResponseDto> {
    const user = await this.userService.findById(id);
    return user as ExtendedUserResponseDto;
  }

  @Get(':id/statistics')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Get user statistics (Admin/Instructor only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User statistics',
    type: UserStatisticsDto,
  })
  async getUserStatistics(@Param('id') id: string): Promise<UserStatisticsDto> {
    return this.userService.getUserStatistics(id);
  }

  @Get(':id/activities')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Get user activities (Admin/Instructor only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User activities',
  })
  async getUserActivities(@Param('id') id: string, @Query('limit') limit?: number) {
    return this.userService.getUserActivities(id, limit);
  }

  @Get(':id/invoices')
  @Roles('admin')
  @ApiOperation({ summary: 'Get user invoices (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User invoices',
  })
  async getUserInvoices(@Param('id') id: string) {
    return this.userService.getUserInvoices(id);
  }

  @Get(':id/labs')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Get user enrolled labs (Admin/Instructor only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User enrolled labs',
  })
  async getUserLabs(@Param('id') id: string) {
    return this.userService.getUserEnrolledLabs(id);
  }

  @Get(':id/edit-history')
  @Roles('admin')
  @ApiOperation({ summary: 'Get user edit history (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User edit history',
    type: [UserEditHistoryDto],
  })
  async getEditHistory(@Param('id') id: string, @Query('limit') limit?: number) {
    return this.userService.getEditHistory(id, limit);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create new user (Admin only)' })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: ExtendedUserResponseDto,
  })
  async create(
    @Body() dto: ExtendedCreateUserDto,
    @CurrentUser() jwtUser: JwtUser
  ): Promise<ExtendedUserResponseDto> {
    const user = await this.userService.createExtended(
      dto,
      jwtUser.sub,
      jwtUser.username || jwtUser.email
    );
    return user as ExtendedUserResponseDto;
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update user (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: ExtendedUserResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: ExtendedUpdateUserDto,
    @CurrentUser() jwtUser: JwtUser
  ): Promise<ExtendedUserResponseDto> {
    const user = await this.userService.updateExtended(
      id,
      dto,
      jwtUser.sub,
      jwtUser.username || jwtUser.email
    );
    return user as ExtendedUserResponseDto;
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully',
  })
  async delete(@Param('id') id: string, @CurrentUser() jwtUser: JwtUser) {
    return this.userService.deleteUser(
      id,
      jwtUser.sub,
      jwtUser.username || jwtUser.email
    );
  }

  @Patch(':id/status')
  @Roles('admin')
  @ApiOperation({ summary: 'Update user status (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User status updated successfully',
    type: UserResponseDto,
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto
  ): Promise<UserResponseDto> {
    const user = await this.userService.updateStatus(id, dto);
    return user as UserResponseDto;
  }

  @Post(':id/lock')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lock user account (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Account locked successfully',
    type: UserResponseDto,
  })
  async lockAccount(
    @Param('id') id: string,
    @Body() dto: LockAccountDto,
    @CurrentUser() jwtUser: JwtUser
  ): Promise<UserResponseDto> {
    const user = await this.userService.lockAccount(
      id,
      dto.reason,
      jwtUser.sub,
      jwtUser.username || jwtUser.email
    );
    return user as UserResponseDto;
  }

  @Post(':id/unlock')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlock user account (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Account unlocked successfully',
    type: UserResponseDto,
  })
  async unlockAccount(
    @Param('id') id: string,
    @CurrentUser() jwtUser: JwtUser
  ): Promise<UserResponseDto> {
    const user = await this.userService.unlockAccount(
      id,
      jwtUser.sub,
      jwtUser.username || jwtUser.email
    );
    return user as UserResponseDto;
  }

  @Post(':id/reset-password')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset user password (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent',
  })
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(id, dto.message);
  }

  @Post(':id/send-email')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send email to user (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Email sent successfully',
  })
  async sendEmail(@Param('id') id: string, @Body() dto: SendEmailDto) {
    return this.userService.sendEmail(id, dto);
  }

  @Put(':id/admin-notes')
  @Roles('admin')
  @ApiOperation({ summary: 'Update admin notes (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Admin notes updated successfully',
    type: UserResponseDto,
  })
  async updateAdminNotes(
    @Param('id') id: string,
    @Body() dto: UpdateAdminNotesDto,
    @CurrentUser() jwtUser: JwtUser
  ): Promise<UserResponseDto> {
    const user = await this.userService.updateAdminNotes(
      id,
      dto,
      jwtUser.sub,
      jwtUser.username || jwtUser.email
    );
    return user as UserResponseDto;
  }

  // ============================================
  // INSTRUCTOR ENDPOINTS
  // ============================================

  @Get('students/list')
  @Roles('instructor', 'admin')
  @ApiOperation({ summary: 'List students (Instructor/Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of students',
    type: InstructorStudentsResponseDto,
  })
  async getStudents(
    @CurrentUser() jwtUser: JwtUser,
    @Query() query: QueryUsersDto
  ): Promise<InstructorStudentsResponseDto> {
    return this.userService.getStudents(jwtUser.sub, query);
  }

  @Get('students/:id')
  @Roles('instructor', 'admin')
  @ApiOperation({ summary: 'Get student detail (Instructor/Admin only)' })
  @ApiParam({ name: 'id', description: 'Student UUID' })
  @ApiResponse({
    status: 200,
    description: 'Student details with statistics',
    type: InstructorStudentDetailResponseDto,
  })
  async getStudentDetail(
    @Param('id') id: string,
    @CurrentUser() jwtUser: JwtUser
  ): Promise<InstructorStudentDetailResponseDto> {
    return this.userService.getStudentDetail(id, jwtUser.sub) as Promise<InstructorStudentDetailResponseDto>;
  }

  @Put('students/:id/instructor-notes')
  @Roles('instructor', 'admin')
  @ApiOperation({ summary: 'Update instructor notes (Instructor/Admin only)' })
  @ApiParam({ name: 'id', description: 'Student UUID' })
  @ApiResponse({
    status: 200,
    description: 'Instructor notes updated successfully',
    type: UserResponseDto,
  })
  async updateInstructorNotes(
    @Param('id') id: string,
    @Body() dto: UpdateInstructorNotesDto,
    @CurrentUser() jwtUser: JwtUser
  ): Promise<UserResponseDto> {
    const user = await this.userService.updateInstructorNotes(
      id,
      dto,
      jwtUser.sub,
      jwtUser.username || jwtUser.email
    );
    return user as UserResponseDto;
  }

  // ============================================
  // GROUP MANAGEMENT ENDPOINTS
  // ============================================

  @Get(':id/groups')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Get user groups (Admin/Instructor only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User groups',
    type: [UserGroupResponseDto],
  })
  async getUserGroups(@Param('id') id: string): Promise<UserGroupResponseDto[]> {
    const groups = await this.userService.getUserGroups(id);
    return groups as UserGroupResponseDto[];
  }

  @Post(':id/groups/:groupId')
  @Roles('admin', 'instructor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign user to group (Admin/Instructor only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiParam({ name: 'groupId', description: 'Group UUID' })
  @ApiResponse({
    status: 201,
    description: 'User assigned to group successfully',
    type: UserGroupResponseDto,
  })
  async assignToGroup(
    @Param('id') userId: string,
    @Param('groupId') groupId: string,
    @Body() dto?: AssignUserToGroupDto
  ): Promise<UserGroupResponseDto> {
    const userGroup = await this.userService.assignToGroup(
      userId,
      groupId,
      dto?.roleInGroup
    );
    return userGroup as UserGroupResponseDto;
  }

  @Delete(':id/groups/:groupId')
  @Roles('admin', 'instructor')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove user from group (Admin/Instructor only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiParam({ name: 'groupId', description: 'Group UUID' })
  @ApiResponse({
    status: 204,
    description: 'User removed from group successfully',
  })
  async removeFromGroup(
    @Param('id') userId: string,
    @Param('groupId') groupId: string
  ) {
    return this.userService.removeFromGroup(userId, groupId);
  }
}
