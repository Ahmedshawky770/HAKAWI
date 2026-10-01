import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Req,
  Request,
  UseGuards,
  Query,
  Param,
  Inject,
  Res,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { type Response } from 'express';

import { Public } from '../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { ThrottleTier } from '../../common/decorators/throttle-tier.decorator.ts';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  buildAuthCookieOptions,
  parseCookieHeader,
} from '../../common/constants/auth-cookie.constants.ts';

import { AuthService } from './auth.service.ts';
import { RegisterDto, LoginDto, RefreshTokenDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto.ts';

interface CookieBearingRequest {
  readonly headers: { readonly cookie?: string };
}

function writeAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, buildAuthCookieOptions(ACCESS_TOKEN_TTL_MS));
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, buildAuthCookieOptions(REFRESH_TOKEN_TTL_MS));
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
}

/**
 * The refresh token lives in an httpOnly cookie for browsers and in the request body for
 * non-browser clients. One resolver for both handlers (refresh and logout) so the precedence
 * can never drift apart between the two endpoints that revoke the same token.
 */
function resolveRefreshToken(req: CookieBearingRequest, bodyToken: string | undefined): string | undefined {
  // WHY the length check and not `??`: an empty string is not nullish, so a cookie the browser
  // has already cleared (`refresh_token=`, still sent) would shadow a perfectly good body token.
  // "Present" has to mean "has content", which is the same rule the service applies.
  const cookieToken = parseCookieHeader(req.headers.cookie)[REFRESH_TOKEN_COOKIE];
  return cookieToken !== undefined && cookieToken.length > 0 ? cookieToken : bodyToken;
}

@ThrottleTier('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    const result = await this.authService.register(dto);
    writeAuthCookies(res, result.tokens);
    return res.json(result);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    const result = await this.authService.login(dto);
    writeAuthCookies(res, result.tokens);
    return res.json(result);
  }

  // The controller default is the `auth` tier (human login attempts, 10/min per IP). Refresh is
  // machine traffic — one call per page load, and several tabs plus a poll can stack up — so it
  // overrides with the `session` tier. Sharing the login budget meant ten automatic refreshes
  // across one office NAT or mobile CGNAT blocked the whole egress address for a minute and
  // logged out every user behind it.
  @ThrottleTier('session')
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: CookieBearingRequest,
    @Body() dto: RefreshTokenDto,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const result = await this.authService.refreshTokens({
        ...dto,
        refreshToken: resolveRefreshToken(req, dto.refreshToken),
      });
      writeAuthCookies(res, result.tokens);
      return res.json(result);
    } catch (error) {
      // WHY only on 401: a rejected refresh means the cookies the browser still holds are dead
      // weight, and leaving them in place makes the next silent retry fail the same way. A 5xx
      // is our fault, not the session's, so those cookies are still the user's only way back in.
      if (error instanceof UnauthorizedException) {
        clearAuthCookies(res);
      }
      throw error;
    }
  }

  @ThrottleTier('session')
  @Get('session')
  @UseGuards(JwtAuthGuard)
  session(@Request() req: { user: { sub: string } }) {
    return this.authService.session(req.user.sub);
  }

  @ThrottleTier('session')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: CookieBearingRequest,
    @Body('refreshToken') refreshToken: string | undefined,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.authService.logout(resolveRefreshToken(req, refreshToken));
    clearAuthCookies(res);
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
      return res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?error=${encodeURIComponent(error)}`,
      );
    }

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?error=missing_code`);
    }

    try {
      const tokens = await this.authService.handleOAuthCallback(provider, code, state);
      writeAuthCookies(res, tokens);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback`);
    } catch (err) {
      Logger.error('OAuth callback failed', err, 'AuthController');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?error=oauth_failed`);
    }
  }
}
