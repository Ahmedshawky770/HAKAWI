import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';

import { ModerationService } from './moderation.service.ts';
import { ModerationController } from './moderation.controller.ts';
import { AdminDashboardService } from './admin-dashboard.service.ts';
import { AdminDashboardController } from './admin-dashboard.controller.ts';
import { ModerationEventHandler } from './events/moderation.event-handler.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [ModerationController, AdminDashboardController],
  providers: [ModerationService, AdminDashboardService, ModerationEventHandler],
  exports: [ModerationService, AdminDashboardService],
})
export class ModerationModule {}
