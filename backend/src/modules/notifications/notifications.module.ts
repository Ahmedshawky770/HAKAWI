import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './services/notifications.service.js';
import { NOTIFICATIONS_REPOSITORY } from './interfaces/notifications-repository.interface.js';
import { NotificationsRepository } from './repositories/notifications.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: NOTIFICATIONS_REPOSITORY,
      useClass: NotificationsRepository,
    },
  ],
  exports: [NotificationsService, NOTIFICATIONS_REPOSITORY],
})
export class NotificationsModule {}
