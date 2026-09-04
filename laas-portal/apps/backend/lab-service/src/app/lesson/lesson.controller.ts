import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LessonService } from './lesson.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { ReorderLessonsDto } from './dto/reorder-lessons.dto';
import { successResponse } from '../common/response.helper';

@ApiTags('Lessons')
@Controller('lessons')
export class LessonController {
  constructor(private readonly service: LessonService) {}

  // Create a new lesson for a group/class.
  @Post()
  @ApiOperation({ summary: 'Create a new lesson' })
  @ApiResponse({ status: 201 })
  async create(
    @Body() dto: CreateLessonDto,
    @Headers('x-user-id') userId: string,
  ) {
    const data = await this.service.create(dto, userId);
    return successResponse('Lesson created successfully', data);
  }

  // List all lessons for a specific group, ordered by orderNo.
  @Get('by-group/:groupId')
  @ApiOperation({ summary: 'Get lessons by group' })
  async findByGroup(@Param('groupId') groupId: string) {
    const data = await this.service.findByGroup(groupId);
    return successResponse('Lessons retrieved', data);
  }

  // Get detailed lesson information including attached class labs.
  @Get(':id')
  @ApiOperation({ summary: 'Get lesson detail' })
  async findById(@Param('id') id: string) {
    const data = await this.service.findById(id);
    return successResponse('Lesson retrieved', data);
  }

  // Update lesson fields.
  @Put(':id')
  @ApiOperation({ summary: 'Update a lesson' })
  async update(@Param('id') id: string, @Body() dto: UpdateLessonDto) {
    const data = await this.service.update(id, dto);
    return successResponse('Lesson updated successfully', data);
  }

  // Delete a lesson and detach any linked class labs.
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a lesson' })
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return successResponse('Lesson deleted successfully');
  }

  // Batch reorder lessons within a group.
  @Post('reorder')
  @ApiOperation({ summary: 'Reorder lessons' })
  async reorder(@Body() dto: ReorderLessonsDto) {
    await this.service.reorder(dto.items);
    return successResponse('Lessons reordered successfully');
  }
}
