import { Controller, Post, Body, HttpCode, HttpStatus, Get, Request, UseGuards, Query, Param, Inject, Res, Logger } from '@nestjs/common';
import { type Response } from 'express';

import { Public } from '../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';

import { AuthService } from './auth.service.ts';
import { RegisterDto, LoginDto, RefreshTokenDto, LogoutResponseDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto.ts';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  session(@Request() req: { user: { sub: string } }) {
    return this.authService.session(req.user.sub);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body('refreshToken') refreshToken: string): Promise<LogoutResponseDto> {
    return this.authService.logout(refreshToken);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If the email exists, a reset link has been sent' };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.password);
    return { message: 'Password reset successfully' };
  }

  @Get('oauth/:provider')
  @Public()
  async oauth(@Param('provider') provider: string, @Query('state') state: string, @Res() res: Response) {
    const authorizationUrl = await this.authService.getAuthorizationUrl(provider, state);
    return res.redirect(authorizationUrl);
  }

  @Get('oauth/:provider/callback')
  @Public()
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?error=missing_code`);
    }

    try {
      const tokens = await this.authService.handleOAuthCallback(provider, code, state);
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?access_token=${tokens.accessToken}&refresh_token=${tokens.refreshToken}`;
      return res.redirect(redirectUrl);
    } catch (err) {
      Logger.error('OAuth callback failed', err, 'AuthController');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?error=oauth_failed`);
    }
  }
}
