import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GuacamoleService } from './guacamole.service';

@Controller('v1/openstack/guacamole')
export class GuacamoleController {
  constructor(private guacamoleService: GuacamoleService) {}

  @Get('quickconnect')
  async quickconnect(
    @Query()
    query: {
      host?: string;
      port?: string;
      connectionName?: string;
    },
    @Res() res: Response
  ) {
    const host = query.host?.trim();

    if (!host) {
      return res.status(400).send('Missing host');
    }

    const result = await this.guacamoleService.createSshConnection({
      connectionName: query.connectionName?.trim() || `SSH_${host}_${Date.now()}`,
      host,
      port: query.port ? Number(query.port) : 22,
    });

    return res.redirect(302, result.guacamoleUrl);
  }

  @Post('connections')
  async createConnection(
    @Body()
    body: {
      connectionName: string;
      host: string;
      port?: number;
      username?: string;
      password?: string;
    }
  ) {
    return this.guacamoleService.createSshConnection({
      connectionName: body.connectionName,
      host: body.host,
      port: body.port || 22,
      username: body.username,
      password: body.password,
    });
  }

  @Delete('connections/:connectionId')
  @HttpCode(204)
  async deleteConnection(@Param('connectionId') connectionId: string) {
    await this.guacamoleService.deleteConnection(Number(connectionId));
  }
}
