import { Module } from '@nestjs/common';
import { ProvisioningProfileController } from './provisioning-profile.controller';
import { ProvisioningProfileService } from './provisioning-profile.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [ProvisioningProfileController],
  providers: [ProvisioningProfileService, PrismaService],
  exports: [ProvisioningProfileService],
})
export class ProvisioningProfileModule {}
