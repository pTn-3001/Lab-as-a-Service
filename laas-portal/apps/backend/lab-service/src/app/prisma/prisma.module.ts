import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Make PrismaService globally injectable to keep feature modules lightweight.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
