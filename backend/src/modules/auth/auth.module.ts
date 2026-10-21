import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { CommonModule } from '../../common/common.module.ts';
import { EmailVerificationModule } from '../email-verification/email-verification.module.ts';

import { AuthController } from './auth.controller.ts';
import { MfaController } from './mfa.controller.ts';
import { AuthService } from './auth.service.ts';
import { AccountLockoutService } from './account-lockout.service.ts';
import { CaptchaService } from './captcha.service.ts';

@Module({
  imports: [CommonModule, EmailVerificationModule, EventEmitterModule, ConfigModule],
  controllers: [AuthController, MfaController],
  // `MfaService` is NOT provided here: `MfaGuard` is provided by `CommonModule`, and a
  // guard can only be injected with what its own module can see. Providing the service
  // here as well would mean two instances of it — one for the controller and one for the
  // guard — and would leave `CommonModule` unable to resolve it, which is what stopped
  // the application from starting. It is provided and exported by `CommonModule` now, and
  // `MfaController` reads it from there.
  providers: [AuthService, AccountLockoutService, CaptchaService],
  exports: [AuthService, AccountLockoutService, CaptchaService],
})
export class AuthModule {}
