import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module.ts';

import { AdminWafController } from './admin-waf.controller.ts';

@Module({
  imports: [CommonModule],
  controllers: [AdminWafController],
})
export class AdminModule {}