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
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    const result = await this.authService.register(dto);
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('access_token', result.tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    res.cookie('refresh_token', result.tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return res.json(result);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    const result = await this.authService.login(dto);
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('access_token', result.tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    res.cookie('refresh_token', result.tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return res.json(result);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto, @Res() res: Response) {
    const result = await this.authService.refreshTokens(dto);
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('access_token', result.tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    res.cookie('refresh_token', result.tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return res.json(result);
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  session(@Request() req: { user: { sub: string } }) {
    return this.authService.session(req.user.sub);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body('refreshToken') refreshToken: string, @Res() res: Response): Promise<LogoutResponseDto> {
    const result = await this.authService.logout(refreshToken);
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
    return res.json(result);
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
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('access_token', tokens.accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
        path: '/',
      });
      res.cookie('refresh_token', tokens.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback`);
    } catch (err) {
      Logger.error('OAuth callback failed', err, 'AuthController');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?error=oauth_failed`);
    }
  }
}
