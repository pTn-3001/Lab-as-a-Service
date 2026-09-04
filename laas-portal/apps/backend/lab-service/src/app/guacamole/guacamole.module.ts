import { Module } from '@nestjs/common';
import { GuacamoleController } from './guacamole.controller';
import { GuacamoleService } from './guacamole.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [GuacamoleController],
  providers: [GuacamoleService, PrismaService],
  exports: [GuacamoleService],
})
export class GuacamoleModule {}
