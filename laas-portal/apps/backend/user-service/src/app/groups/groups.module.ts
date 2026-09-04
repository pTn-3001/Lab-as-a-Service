import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET') || 'dev-jwt-secret',
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [GroupsController],
  providers: [GroupsService, JwtAuthGuard, RolesGuard],
  exports: [GroupsService],
})
export class GroupsModule {}
