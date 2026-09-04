import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ProvisioningProfileService } from './provisioning-profile.service';

@Controller('provisioning-profiles')
export class ProvisioningProfileController {
  constructor(private svc: ProvisioningProfileService) {}

  @Post()
  create(@Body() body: any) {
    return this.svc.create(body);
  }

  @Get()
  list() {
    return this.svc.findAll();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
}
