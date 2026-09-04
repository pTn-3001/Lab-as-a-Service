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
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ModuleService } from './module.service';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { ReorderModulesDto } from './dto/reorder-modules.dto';
import { successResponse } from '../common/response.helper';

@ApiTags('Modules')
@Controller()
export class ModuleController {
  constructor(private readonly service: ModuleService) {}

  // Create module under a lab template.
  @Post('lab-templates/:labTemplateId/modules')
  @ApiOperation({ summary: 'Create a module for a lab template' })
  async create(
    @Param('labTemplateId') labTemplateId: string,
    @Body() dto: CreateModuleDto,
  ) {
    const data = await this.service.create(labTemplateId, dto);
    return successResponse('Module created successfully', data);
  }

  // List modules sorted by orderNo.
  @Get('lab-templates/:labTemplateId/modules')
  @ApiOperation({ summary: 'List all modules for a lab template' })
  async findAll(@Param('labTemplateId') labTemplateId: string) {
    const data = await this.service.findAllByLab(labTemplateId);
    return successResponse('Modules retrieved', data);
  }

  // Get one module by id.
  @Get('modules/:moduleId')
  @ApiOperation({ summary: 'Get module detail' })
  async findOne(@Param('moduleId') id: string) {
    const data = await this.service.findOne(id);
    return successResponse('Module retrieved', data);
  }

  // Update module metadata/definition.
  @Put('modules/:moduleId')
  @ApiOperation({ summary: 'Update a module' })
  async update(@Param('moduleId') id: string, @Body() dto: UpdateModuleDto) {
    const data = await this.service.update(id, dto);
    return successResponse('Module updated successfully', data);
  }

  // Soft-delete module and keep auditability.
  @Delete('modules/:moduleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a module' })
  async remove(@Param('moduleId') id: string) {
    await this.service.softDelete(id);
    return successResponse('Module deleted successfully');
  }

  // Reorder modules atomically in one request.
  @Post('lab-templates/:labTemplateId/modules/reorder')
  @ApiOperation({ summary: 'Reorder modules within a lab template' })
  async reorder(
    @Param('labTemplateId') labTemplateId: string,
    @Body() dto: ReorderModulesDto,
  ) {
    await this.service.reorder(labTemplateId, dto);
    return successResponse('Modules reordered successfully');
  }
}
