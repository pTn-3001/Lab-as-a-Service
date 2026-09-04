import { Module } from '@nestjs/common';
import { ClassLabController } from './class-lab.controller';
import { ClassLabService } from './class-lab.service';

// Feature module for managing lab assignments within class groups.
@Module({
  controllers: [ClassLabController],
  providers: [ClassLabService],
  exports: [ClassLabService],
})
export class ClassLabModule {}
