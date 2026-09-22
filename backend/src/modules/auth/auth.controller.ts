import { Controller, Post, Body, HttpCode, HttpStatus, Get, Request, UseGuards, Query, Param } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto, LoginDto, RefreshTokenDto, LogoutResponseDto, OAuthUserInfoDto } from './dto/auth.dto.js';
import { Public } from '../../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  logout(@Body() dto: RefreshTokenDto): Promise<LogoutResponseDto> {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('oauth/:provider')
  @Public()
  oauth(@Param('provider') provider: string, @Query() query: OAuthUserInfoDto) {
    return this.authService.oauthLogin(provider, query);
  }
}
