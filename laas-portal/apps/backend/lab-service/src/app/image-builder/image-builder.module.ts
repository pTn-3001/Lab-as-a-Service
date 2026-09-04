import { Module } from '@nestjs/common';
import { ImageBuilderController } from './image-builder.controller';
import { ImageBuilderService } from './image-builder.service';
import { PrismaModule } from '../prisma/prisma.module';
import { GuacamoleModule } from '../guacamole/guacamole.module';

@Module({
  imports: [PrismaModule, GuacamoleModule],
  controllers: [ImageBuilderController],
  providers: [ImageBuilderService],
})
export class ImageBuilderModule {}
