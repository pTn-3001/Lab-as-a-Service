import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { UserLabAccessService } from './user-lab-access.service';
import { successResponse } from '../common/response.helper';

class GrantAccessDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  grantedBy?: string;

  @ApiPropertyOptional({ description: 'ISO datetime string; omit for permanent access' })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

@ApiTags('Lab Access Control')
@Controller('lab-access')
export class UserLabAccessController {
  constructor(private readonly service: UserLabAccessService) {}

  // Grant a user access to a RESTRICTED lab. Idempotent (upsert).
  @Post(':labTemplateId/grant')
  @ApiOperation({ summary: 'Grant user access to a restricted lab' })
  async grant(@Param('labTemplateId') labTemplateId: string, @Body() dto: GrantAccessDto) {
    const data = await this.service.grantAccess({
      labTemplateId,
      userId: dto.userId,
      grantedBy: dto.grantedBy,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });
    return successResponse('Access granted', data);
  }

  // Revoke a user's access to a RESTRICTED lab.
  @Delete(':labTemplateId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke user access to a restricted lab' })
  async revoke(
    @Param('labTemplateId') labTemplateId: string,
    @Query('userId') userId: string,
  ) {
    await this.service.revokeAccess(labTemplateId, userId);
    return successResponse('Access revoked');
  }

  // Check if a specific user has access (returns { hasAccess: boolean }).
  @Get(':labTemplateId/check')
  @ApiOperation({ summary: 'Check if a user has access to a lab' })
  async check(
    @Param('labTemplateId') labTemplateId: string,
    @Query('userId') userId: string,
  ) {
    const hasAccess = await this.service.checkAccess(labTemplateId, userId);
    return successResponse('Access check complete', { hasAccess });
  }

  // List all users who have been granted access to a lab.
  @Get(':labTemplateId/users')
  @ApiOperation({ summary: 'List users with access to a restricted lab' })
  async listUsers(@Param('labTemplateId') labTemplateId: string) {
    const data = await this.service.listUsersWithAccess(labTemplateId);
    return successResponse('Users with access', data);
  }

  // List all labs a specific user has access to (RESTRICTED grants only).
  @Get('users/:userId/labs')
  @ApiOperation({ summary: "List all restricted labs a user has been granted access to" })
  async listLabsForUser(@Param('userId') userId: string) {
    const data = await this.service.listLabsForUser(userId);
    return successResponse('Labs with access', data);
  }
}
