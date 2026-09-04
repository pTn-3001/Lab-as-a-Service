import { Module } from '@nestjs/common';
import { LabTemplateController } from './lab-template.controller';
import { LabTemplateService } from './lab-template.service';
import { ArtifactGenerationService } from '../common/artifact-generation.service';
import { UserLabAccessController } from './user-lab-access.controller';
import { UserLabAccessService } from './user-lab-access.service';

// Feature module for lab template lifecycle + artifact regeneration hooks.
@Module({
  controllers: [LabTemplateController, UserLabAccessController],
  providers: [LabTemplateService, ArtifactGenerationService, UserLabAccessService],
  exports: [LabTemplateService, UserLabAccessService],
})
export class LabTemplateModule {}
