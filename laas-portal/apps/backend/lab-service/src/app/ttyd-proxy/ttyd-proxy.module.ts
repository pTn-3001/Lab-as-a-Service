import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TtydProxyController } from './ttyd-proxy.controller';
import { TtydProxyService } from './ttyd-proxy.service';

@Module({
  imports: [PrismaModule],
  controllers: [TtydProxyController],
  providers: [TtydProxyService],
  exports: [TtydProxyService],
})
export class TtydProxyModule {}
