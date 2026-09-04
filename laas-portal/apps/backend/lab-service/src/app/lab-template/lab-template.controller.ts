import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LabTemplateService } from './lab-template.service';
import { CreateLabTemplateDto } from './dto/create-lab-template.dto';
import { UpdateLabTemplateDto } from './dto/update-lab-template.dto';
import { QueryLabTemplateDto } from './dto/query-lab-template.dto';
import { successResponse, paginatedResponse } from '../common/response.helper';

@ApiTags('Lab Templates')
@Controller('lab-templates')
export class LabTemplateController {
  constructor(private readonly service: LabTemplateService) {}

  // Create a lab template and trigger initial artifact generation.
  @Post()
  @ApiOperation({ summary: 'Create a new lab template' })
  @ApiResponse({ status: 201 })
  async create(@Body() dto: CreateLabTemplateDto) {
    const data = await this.service.create(dto);
    return successResponse('Lab template created successfully', data);
  }

  // List lab templates with server-side pagination/filtering.
  @Get()
  @ApiOperation({ summary: 'List lab templates with filtering & pagination' })
  async findAll(@Query() query: QueryLabTemplateDto) {
    const { items, pagination } = await this.service.findAll(query);
    return paginatedResponse(items, pagination);
  }

  // Retrieve one lab template by id.
  @Get(':labTemplateId')
  @ApiOperation({ summary: 'Get lab template detail' })
  async findOne(@Param('labTemplateId') id: string) {
    const data = await this.service.findOne(id);
    return successResponse('Lab template retrieved', data);
  }

  // Update lab metadata and regenerate artifacts.
  @Put(':labTemplateId')
  @ApiOperation({ summary: 'Update lab template' })
  async update(@Param('labTemplateId') id: string, @Body() dto: UpdateLabTemplateDto) {
    const data = await this.service.update(id, dto);
    return successResponse('Lab template updated successfully', data);
  }

  // Soft delete lab and clear artifact records/files.
  @Delete(':labTemplateId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a lab template' })
  async remove(@Param('labTemplateId') id: string) {
    await this.service.softDelete(id);
    return successResponse('Lab template deleted successfully');
  }

  // Publish guard checks are implemented in service layer.
  @Post(':labTemplateId/publish')
  @ApiOperation({ summary: 'Publish a lab template' })
  async publish(@Param('labTemplateId') id: string) {
    const data = await this.service.publish(id);
    return successResponse('Lab template published successfully', data);
  }

  // Archive prevents further active use without deleting history.
  @Post(':labTemplateId/archive')
  @ApiOperation({ summary: 'Archive a lab template' })
  async archive(@Param('labTemplateId') id: string) {
    const data = await this.service.archive(id);
    return successResponse('Lab template archived successfully', data);
  }

  // Initialization endpoint used by admin portal before creating Heat stacks.
  @Get(':labTemplateId/artifacts')
  @ApiOperation({ summary: 'Get generated artifacts for lab initialization' })
  async getArtifacts(@Param('labTemplateId') id: string) {
    const data = await this.service.getArtifactsForInitialization(id);
    return successResponse('Lab artifacts retrieved', data);
  }
}
