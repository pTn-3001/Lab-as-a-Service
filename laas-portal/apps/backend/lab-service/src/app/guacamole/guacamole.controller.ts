import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { GuacamoleService } from './guacamole.service';

@Controller('guacamole')
export class GuacamoleController {
  constructor(private svc: GuacamoleService) {}

  @Post('connections')
  create(@Body() body: any) {
    return this.svc.createConnection(body);
  }

  @Get('connections/:sessionId')
  list(@Param('sessionId') sessionId: string) {
    return this.svc.listForSession(sessionId);
  }
}
