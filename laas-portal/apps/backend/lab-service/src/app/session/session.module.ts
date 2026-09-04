import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SessionController } from './session.controller';
import { CheckpointController } from './checkpoint.controller';
import { SessionService } from './session.service';
import { CheckpointService } from './checkpoint.service';
import { PrismaService } from '../prisma/prisma.service';
import { GuacamoleModule } from '../guacamole/guacamole.module';

@Module({
  imports: [GuacamoleModule, ConfigModule],
  controllers: [SessionController, CheckpointController],
  providers: [SessionService, CheckpointService, PrismaService],
  exports: [SessionService, CheckpointService],
})
export class SessionModule {}
