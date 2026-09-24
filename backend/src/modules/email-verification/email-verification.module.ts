import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../db/database.module.ts';

import { EmailVerificationService } from './email-verification.service.ts';
import { EmailVerificationController } from './email-verification.controller.ts';

@Module({
  imports: [DatabaseModule],
  controllers: [EmailVerificationController],
  providers: [EmailVerificationService],
  exports: [EmailVerificationService],
})
export class EmailVerificationModule {}
