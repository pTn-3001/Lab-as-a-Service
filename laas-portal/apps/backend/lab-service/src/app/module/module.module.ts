import { Module } from '@nestjs/common';
import { ModuleController } from './module.controller';
import { ModuleService } from './module.service';
import { ArtifactGenerationService } from '../common/artifact-generation.service';

// Feature module for module CRUD/reorder inside a lab template.
@Module({
  controllers: [ModuleController],
  providers: [ModuleService, ArtifactGenerationService],
  exports: [ModuleService],
})
export class LabModuleModule {}
