import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { NotificationsModule } from '../notifications/notifications.module.ts';

import { BadgesService } from './badges.service.ts';
import { BadgesController } from './badges.controller.ts';
import { BadgesEventHandler } from './events/badges.event-handler.ts';

/**
 * `NotificationsModule` is imported for one reason: a badge award has to leave a row a user
 * can see. Everything else about badges stays event-driven, and the import is one-way — the
 * notifications module knows nothing about badges, so there is no cycle to reason about.
 */
@Module({
  imports: [CommonModule, DatabaseModule, NotificationsModule],
  controllers: [BadgesController],
  providers: [BadgesService, BadgesEventHandler],
  exports: [BadgesService],
})
export class BadgesModule {}
