import { Controller, Post, Body, Headers, Get, Param, ParamData, Put } from '@nestjs/common';
import { ImageBuilderService } from './image-builder.service';

@Controller('image-builder')
export class ImageBuilderController {
  constructor(private readonly builderService: ImageBuilderService) {}

  @Post()
  async createSession(
    @Headers('x-user-id') userId: string,
    @Body() body: { baseImageId: string; flavorId: string; targetImageName: string; targetImageDesc?: string; customBaseImageName?: string }
  ) {
    const finalUserId = userId || 'instructor-default-id';
    return this.builderService.createBuildSession(finalUserId, body);
  }

  @Get('pending')
  async getPendingApprovals() {
    return this.builderService.getPendingApprovals();
  }

  @Post(':sessionId/approve')
  async approveSession(
    @Headers('x-user-id') adminId: string,
    @Param('sessionId') sessionId: string,
  ) {
    const finalAdminId = adminId || 'admin';
    return this.builderService.approveSession(finalAdminId, sessionId);
  }

  @Post(':sessionId/reject')
  async rejectSession(
    @Headers('x-user-id') adminId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { note?: string },
  ) {
    const finalAdminId = adminId || 'admin';
    return this.builderService.rejectSession(finalAdminId, sessionId, body.note);
  }

  @Get(':sessionId/inspect')
  async inspectSession(@Param('sessionId') sessionId: string) {
    return this.builderService.inspectSession(sessionId);
  }

  @Get(':sessionId')
  async getSessionStatus(
    @Headers('x-user-id') userId: string,
    @Param('sessionId') sessionId: string
  ) {
    const finalUserId = userId || 'instructor-default-id';
    return this.builderService.getSessionStatus(finalUserId, sessionId);
  }

  @Post(':sessionId/publish')
  async publishImage(
    @Headers('x-user-id') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { name?: string; description?: string; visibility?: string }
  ) {
    const finalUserId = userId || 'instructor-default-id';
    return this.builderService.publishImage(finalUserId, sessionId, body);
  }
}
