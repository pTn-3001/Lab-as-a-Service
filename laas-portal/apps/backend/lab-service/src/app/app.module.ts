import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { LabTemplateModule } from './lab-template/lab-template.module';
import { LabModuleModule } from './module/module.module';
import { ValidationModule } from './validation/validation.module';
import { ImageModule } from './image/image.module';
import { ProvisioningProfileModule } from './provisioning-profile/provisioning-profile.module';
import { SessionModule } from './session/session.module';
import { GuacamoleModule } from './guacamole/guacamole.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ImageBuilderModule } from './image-builder/image-builder.module';
import { TtydProxyModule } from './ttyd-proxy/ttyd-proxy.module';
import { LessonModule } from './lesson/lesson.module';
import { ClassLabModule } from './class-lab/class-lab.module';

// Root module composes persistence, lab-template CRUD, module CRUD, and validation features.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), 'apps/backend/lab-service/.env')],
    }),
    PrismaModule,
    LabTemplateModule,
    LabModuleModule,
    ValidationModule,
    ImageModule,
    ProvisioningProfileModule,
    SessionModule,
    GuacamoleModule,
    SchedulerModule,
    ImageBuilderModule,
    TtydProxyModule,
    LessonModule,
    ClassLabModule,
  ],
})
export class AppModule {}

