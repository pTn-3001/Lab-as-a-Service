import {
  Controller,
  Get,
  Post,
  Put,
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
  ApiQuery,
} from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AddStudentsDto } from './dto/add-students.dto';
import { AssignInstructorDto } from './dto/assign-instructor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Groups')
@ApiBearerAuth()
@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  // ============================================
  // GROUP CRUD
  // ============================================

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new group/class (Admin only)' })
  @ApiResponse({ status: 201, description: 'Group created successfully' })
  async create(
    @Body() dto: CreateGroupDto,
    @CurrentUser() jwtUser: JwtUser,
  ) {
    return this.groupsService.create(dto, jwtUser.sub);
  }

  @Get()
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'List all groups (Admin sees all, Instructor sees own)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Paginated list of groups' })
  async findAll(
    @Query() query: { page?: number; limit?: number; search?: string; isActive?: string },
    @CurrentUser() jwtUser: JwtUser,
  ) {
    // Instructors only see their own groups
    if (jwtUser.systemRole === 'INSTRUCTOR') {
      return this.groupsService.findMyClasses(jwtUser.sub, 'INSTRUCTOR');
    }
    return this.groupsService.findAll(query);
  }

  // IMPORTANT: /my-classes MUST be defined BEFORE /:id to avoid route conflict
  @Get('my-classes')
  @Roles('admin', 'instructor', 'student')
  @ApiOperation({ summary: 'Get current user\'s classes' })
  @ApiQuery({ name: 'role', required: false, description: 'Filter by role: INSTRUCTOR or STUDENT' })
  @ApiResponse({ status: 200, description: 'List of user\'s classes' })
  async getMyClasses(
    @CurrentUser() jwtUser: JwtUser,
    @Query('role') role?: string,
  ) {
    return this.groupsService.findMyClasses(jwtUser.sub, role);
  }

  @Get(':id')
  @Roles('admin', 'instructor', 'student')
  @ApiOperation({ summary: 'Get group detail by ID' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({ status: 200, description: 'Group details' })
  async findOne(@Param('id') id: string) {
    return this.groupsService.findById(id);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update group (Admin only)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({ status: 200, description: 'Group updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete group (Admin only)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({ status: 200, description: 'Group deactivated successfully' })
  async softDelete(@Param('id') id: string) {
    return this.groupsService.softDelete(id);
  }

  // ============================================
  // STUDENT MANAGEMENT
  // ============================================

  @Post(':id/students')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'Add students to group (Admin/Instructor)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({ status: 201, description: 'Students added successfully' })
  async addStudents(
    @Param('id') groupId: string,
    @Body() dto: AddStudentsDto,
  ) {
    return this.groupsService.addStudents(groupId, dto.studentIds);
  }

  @Delete(':id/students/:studentId')
  @Roles('admin', 'instructor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove student from group (Admin/Instructor)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiParam({ name: 'studentId', description: 'Student UUID' })
  @ApiResponse({ status: 200, description: 'Student removed successfully' })
  async removeStudent(
    @Param('id') groupId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.groupsService.removeStudent(groupId, studentId);
  }

  @Get(':id/students')
  @Roles('admin', 'instructor')
  @ApiOperation({ summary: 'List students in a group (Admin/Instructor)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Paginated list of students' })
  async getStudents(
    @Param('id') groupId: string,
    @Query() query: { page?: number; limit?: number; search?: string },
  ) {
    return this.groupsService.getStudents(groupId, query);
  }

  // ============================================
  // INSTRUCTOR MANAGEMENT
  // ============================================

  @Put(':id/instructor')
  @Roles('admin')
  @ApiOperation({ summary: 'Assign or change instructor for group (Admin only)' })
  @ApiParam({ name: 'id', description: 'Group UUID' })
  @ApiResponse({ status: 200, description: 'Instructor assigned successfully' })
  async assignInstructor(
    @Param('id') groupId: string,
    @Body() dto: AssignInstructorDto,
  ) {
    return this.groupsService.assignInstructor(groupId, dto.instructorId);
  }
}
