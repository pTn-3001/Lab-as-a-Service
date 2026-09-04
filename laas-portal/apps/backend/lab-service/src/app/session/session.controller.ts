import { Controller, Post, Body, Param, Get, Query, Patch, Delete } from '@nestjs/common';
import { SessionService } from './session.service';
import { CheckpointService } from './checkpoint.service';
import { successResponse } from '../common/response.helper';

@Controller('sessions')
export class SessionController {
  constructor(
    private svc: SessionService,
    private checkpointSvc: CheckpointService,
  ) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('labTemplateId') labTemplateId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.svc
      .findAll({
        status,
        userId,
        labTemplateId,
        limit: limit ? Number(limit) : 50,
        offset: offset ? Number(offset) : 0,
      })
      .then((data) => successResponse('Sessions retrieved', data));
  }

  @Post()
  start(@Body() body: any) {
    return this.svc.start(body).then((data) => successResponse('Session created', data));
  }

  @Post(':id/stop')
  stop(@Param('id') id: string) {
    return this.svc.stop(id).then((data) => successResponse('Session stopped', data));
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id).then((data) => successResponse('Session deleted', data));
  }

  @Post(':id/attach-stack')
  attachStack(
    @Param('id') id: string,
    @Body() body: { openstackStackId: string; openstackStackName?: string },
  ) {
    return this.svc
      .attachStack(id, body.openstackStackId, body.openstackStackName)
      .then((data) => successResponse('Stack attached to session', data));
  }

  @Patch(':id/vm-terminals')
  updateVmTerminals(
    @Param('id') id: string,
    @Body() body: { vmTerminals: Array<{ vmName: string; floatingIp: string; ttydPort: number }>; sshNatHost?: string },
  ) {
    return this.svc
      .updateVmTerminals(id, body)
      .then((data) => successResponse('VM terminals updated', data));
  }

  @Get('active')
  findActive(
    @Query('userId') userId: string,
    @Query('moduleId') moduleId: string,
  ) {
    return this.svc
      .findActiveByUserAndModule(userId, moduleId)
      .then((data) => successResponse('Session found', data));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.findOne(id).then((data) => successResponse('Session retrieved', data));
  }

  @Get(':id/checkpoints')
  getCheckpoints(@Param('id') id: string) {
    return this.checkpointSvc
      .getCheckpoints(id)
      .then((data) => successResponse('Checkpoints retrieved', data));
  }
}
