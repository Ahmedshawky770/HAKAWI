import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { CommonModule } from '../../common/common.module.ts';
import { EmailVerificationModule } from '../email-verification/email-verification.module.ts';

import { AuthController } from './auth.controller.ts';
import { MfaController } from './mfa.controller.ts';
import { AuthService } from './auth.service.ts';
import { AccountLockoutService } from './account-lockout.service.ts';
import { MfaService } from './mfa.service.ts';

@Module({
  imports: [CommonModule, EmailVerificationModule, EventEmitterModule, ConfigModule],
  controllers: [AuthController, MfaController],
  providers: [AuthService, AccountLockoutService, MfaService],
  exports: [AuthService, AccountLockoutService, MfaService],
})
export class AuthModule {}
