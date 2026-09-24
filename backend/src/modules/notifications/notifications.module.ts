import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../db/database.module.ts';
import { CommonModule } from '../../common/common.module.ts';

import { NotificationsService } from './notifications.service.ts';
import { NotificationsController } from './controllers/notifications.controller.ts';
import { NotificationsRepository } from './repositories/notifications.repository.ts';
import { NOTIFICATIONS_REPOSITORY } from './interfaces/notifications-repository.interface.ts';
import { NotificationsEventHandler } from './events/notifications.event-handler.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository, NotificationsEventHandler, { provide: NOTIFICATIONS_REPOSITORY, useExisting: NotificationsRepository }],
  exports: [NotificationsService],
})
export class NotificationsModule {}
