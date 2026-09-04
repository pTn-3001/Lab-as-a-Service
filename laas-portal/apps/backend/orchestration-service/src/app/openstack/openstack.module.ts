import { Module } from '@nestjs/common';
import { OpenstackController } from './openstack.controller';
import { OpenstackService } from './openstack.service';

// Feature module exposing OpenStack orchestration APIs.
@Module({
  controllers: [OpenstackController],
  providers: [OpenstackService],
})
export class OpenstackModule {}
