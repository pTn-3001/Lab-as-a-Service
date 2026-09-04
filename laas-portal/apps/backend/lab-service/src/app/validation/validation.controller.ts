import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ValidationService } from './validation.service';
import { successResponse } from '../common/response.helper';
import { ValidationStatus } from '../../generated/prisma-client';

@ApiTags('Validation')
@Controller()
export class ValidationController {
  constructor(private readonly service: ValidationService) {}

  // Trigger validation for one module and persist a validation run.
  @Post('modules/:moduleId/validate')
  @ApiOperation({ summary: 'Validate a single module' })
  async validateModule(@Param('moduleId') moduleId: string) {
    const result = await this.service.validateModule(moduleId);
    const success = result.status === ValidationStatus.VALID;
    return {
      success,
      message: success ? 'Module validation completed' : 'Module validation failed',
      data: { moduleId, ...result },
    };
  }

  // Trigger full-lab validation including cross-module checks.
  @Post('lab-templates/:labTemplateId/validate')
  @ApiOperation({ summary: 'Validate all modules of a lab template' })
  async validateLab(@Param('labTemplateId') labTemplateId: string) {
    const result = await this.service.validateLab(labTemplateId);
    const success = result.status === ValidationStatus.VALID;
    return {
      success,
      message: success ? 'Lab validation completed' : 'Lab validation failed',
      data: { labTemplateId, ...result },
    };
  }

  // Validation history for a lab template.
  @Get('lab-templates/:labTemplateId/validation-runs')
  @ApiOperation({ summary: 'Get validation run history for a lab template' })
  async labValidationRuns(@Param('labTemplateId') labTemplateId: string) {
    const data = await this.service.getLabValidationRuns(labTemplateId);
    return successResponse('Validation runs retrieved', data);
  }

  // Validation history for one module.
  @Get('modules/:moduleId/validation-runs')
  @ApiOperation({ summary: 'Get validation run history for a module' })
  async moduleValidationRuns(@Param('moduleId') moduleId: string) {
    const data = await this.service.getModuleValidationRuns(moduleId);
    return successResponse('Validation runs retrieved', data);
  }
}
