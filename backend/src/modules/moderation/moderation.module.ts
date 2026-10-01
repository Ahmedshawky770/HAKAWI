import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';

import { ModerationService } from './moderation.service.ts';
import { ModerationController } from './moderation.controller.ts';
import { AdminDashboardService } from './admin-dashboard.service.ts';
import { ModerationEventHandler } from './events/moderation.event-handler.ts';
import { ContentModerationService } from './content-moderation/content-moderation.service.ts';
import { ContentModerationEventHandler } from './events/content-moderation.event-handler.ts';
import { EscalationScheduler } from './escalation.scheduler.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [ModerationController],
  providers: [
    ModerationService,
    AdminDashboardService,
    ContentModerationService,
    ModerationEventHandler,
    ContentModerationEventHandler,
    EscalationScheduler,
  ],
  exports: [ModerationService, AdminDashboardService, ContentModerationService],
})
export class ModerationModule {}
