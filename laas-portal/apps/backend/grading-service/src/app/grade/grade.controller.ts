import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GradeService } from './grade.service';
import { SyncGradeDto, ManualGradeDto, QueryGradesDto } from './dto/grade.dto';
import { successResponse, paginatedResponse } from '../common/response.helper';

@ApiTags('Grades')
@Controller('grades')
export class GradeController {
  constructor(private readonly service: GradeService) {}

  /**
   * Sync grade from checkpoint data.
   * Called by frontend when student exits lab, or by lab-service webhook.
   */
  @Post('sync')
  @ApiOperation({ summary: 'Sync grade from checkpoint data' })
  async syncGrade(@Body() dto: SyncGradeDto) {
    const data = await this.service.syncGrade(dto);
    return successResponse('Grade synced successfully', data);
  }

  /**
   * List grades with filtering.
   */
  @Get()
  @ApiOperation({ summary: 'List grades with filters' })
  async findAll(@Query() query: QueryGradesDto) {
    const { items, pagination } = await this.service.findAll(query);
    return paginatedResponse(items, pagination);
  }

  /**
   * Get grade by ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get grade detail' })
  async findById(@Param('id') id: string) {
    const data = await this.service.findById(id);
    return successResponse('Grade retrieved', data);
  }

  /**
   * Get grade for a student + classLab.
   */
  @Get('student/:studentId/class-lab/:classLabId')
  @ApiOperation({ summary: 'Get grade for student in a classLab' })
  async findByStudentAndClassLab(
    @Param('studentId') studentId: string,
    @Param('classLabId') classLabId: string,
  ) {
    const data = await this.service.findByStudentAndClassLab(studentId, classLabId);
    return successResponse('Grade retrieved', data);
  }

  /**
   * Get all grades for a class (group).
   * Used by instructor/admin to view class-wide progress.
   */
  @Get('class/:groupId')
  @ApiOperation({ summary: 'Get all grades in a class' })
  async getClassGrades(
    @Param('groupId') groupId: string,
    @Query('classLabId') classLabId?: string,
  ) {
    const data = await this.service.getClassGrades(groupId, classLabId);
    return successResponse('Class grades retrieved', data);
  }

  /**
   * Get class statistics (avg score, completion rate).
   */
  @Get('class/:groupId/stats')
  @ApiOperation({ summary: 'Get class grade statistics' })
  async getClassStats(
    @Param('groupId') groupId: string,
    @Query('classLabId') classLabId?: string,
  ) {
    const data = await this.service.getClassStats(groupId, classLabId);
    return successResponse('Class stats retrieved', data);
  }

  /**
   * Get student's grades in a specific class.
   * Used by student portal to see own grades.
   */
  @Get('my-grades/:groupId')
  @ApiOperation({ summary: 'Get current student grades in a class' })
  async getMyGrades(
    @Param('groupId') groupId: string,
    @Headers('x-user-id') userId: string,
  ) {
    const data = await this.service.getStudentGradesInGroup(userId, groupId);
    return successResponse('Student grades retrieved', data);
  }

  /**
   * Instructor manually adds score/feedback to a grade.
   */
  @Put(':id/manual-grade')
  @ApiOperation({ summary: 'Manually grade or add feedback' })
  async manualGrade(
    @Param('id') id: string,
    @Body() dto: ManualGradeDto,
  ) {
    const data = await this.service.manualGrade(id, dto);
    return successResponse('Grade updated', data);
  }
}
