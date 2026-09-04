import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService, AuthTokenPayload } from './auth.service';
import { AppService } from './app.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './guards/current-user.decorator';

@Controller('auth')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly authService: AuthService
  ) {}

  @Get()
  health() {
    return this.appService.getData();
  }

  // ── Credentials auth ───────────────────────────────────────────────────────

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString();
    return this.authService.login(dto.username, dto.password, ip);
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString();
    return this.authService.register(dto, ip);
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: { currentPassword: string; newPassword: string }
  ) {
    return this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthTokenPayload) {
    return this.authService.getProfile(user.sub);
  }

  // ── Google OAuth ───────────────────────────────────────────────────────────

  @Get('google')
  @Redirect()
  googleAuth() {
    return { url: this.authService.getGoogleAuthUrl() };
  }

  @Get('google/callback')
  @Redirect()
  async googleCallback(@Query('code') code: string, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString();
    const result = await this.authService.handleGoogleCallback(code, ip);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const params = new URLSearchParams({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: JSON.stringify(result.user),
    });
    return { url: `${frontendUrl}/auth/callback?${params.toString()}` };
  }

  // ── Facebook OAuth ─────────────────────────────────────────────────────────

  @Get('facebook')
  @Redirect()
  facebookAuth() {
    return { url: this.authService.getFacebookAuthUrl() };
  }

  @Get('facebook/callback')
  @Redirect()
  async facebookCallback(@Query('code') code: string, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString();
    const result = await this.authService.handleFacebookCallback(code, ip);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const params = new URLSearchParams({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: JSON.stringify(result.user),
    });
    return { url: `${frontendUrl}/auth/callback?${params.toString()}` };
  }
}
