import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Inject } from '@nestjs/common';

import { Public } from '../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';

import { EmailVerificationService } from './email-verification.service.ts';
import { VerifyEmailDto } from './dto/verify-email.dto.ts';
import { ResendVerificationDto } from './dto/resend-verification.dto.ts';

@Controller('auth')
export class EmailVerificationController {
  constructor(@Inject(EmailVerificationService) private readonly emailVerificationService: EmailVerificationService) {}

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.emailVerificationService.verifyToken(dto.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.emailVerificationService.resend(dto.email);
  }
}
