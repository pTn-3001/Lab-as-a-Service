import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClassLabService } from './class-lab.service';
import { CreateClassLabDto } from './dto/create-class-lab.dto';
import { UpdateClassLabDto } from './dto/update-class-lab.dto';
import { successResponse } from '../common/response.helper';

@ApiTags('Class Labs')
@Controller('class-labs')
export class ClassLabController {
  constructor(private readonly service: ClassLabService) {}

  // Assign a lab template to a class group.
  @Post()
  @ApiOperation({ summary: 'Assign a lab to a class' })
  @ApiResponse({ status: 201 })
  async create(@Body() dto: CreateClassLabDto) {
    const data = await this.service.create(dto);
    return successResponse('Class lab created successfully', data);
  }

  // List all lab assignments for a class group.
  @Get('by-group/:groupId')
  @ApiOperation({ summary: 'Get labs for a class' })
  async findByGroup(@Param('groupId') groupId: string) {
    const data = await this.service.findByGroup(groupId);
    return successResponse('Class labs retrieved', data);
  }

  // List all class assignments for a lab template.
  @Get('by-lab/:labTemplateId')
  @ApiOperation({ summary: 'Get classes assigned to a lab template' })
  async findByLab(@Param('labTemplateId') labTemplateId: string) {
    const data = await this.service.findByLab(labTemplateId);
    return successResponse('Class labs retrieved', data);
  }

  // Get detailed class lab information.
  @Get(':id')
  @ApiOperation({ summary: 'Get class lab detail' })
  async findById(@Param('id') id: string) {
    const data = await this.service.findById(id);
    return successResponse('Class lab retrieved', data);
  }

  // Update class lab fields (deadline, lesson attachment, etc.).
  @Put(':id')
  @ApiOperation({ summary: 'Update a class lab' })
  async update(@Param('id') id: string, @Body() dto: UpdateClassLabDto) {
    const data = await this.service.update(id, dto);
    return successResponse('Class lab updated successfully', data);
  }

  // Remove a lab assignment from a class group.
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove lab from class' })
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return successResponse('Class lab deleted successfully');
  }
}
