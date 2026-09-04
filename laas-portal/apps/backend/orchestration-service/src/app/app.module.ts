import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OpenstackModule } from './openstack/openstack.module';
import { PrismaModule } from './prisma/prisma.module';
import { GuacamoleModule } from './guacamole/guacamole.module';

// Root module wires configuration, persistence, and orchestration features.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), 'apps/backend/orchestration-service/.env')],
    }),
    PrismaModule,
    OpenstackModule,
    GuacamoleModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
