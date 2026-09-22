import { Module } from '@nestjs/common';
import { NotificationPreferencesController } from './notification-preferences.controller.js';
import { NotificationPreferencesService } from './services/notification-preferences.service.js';
import { NOTIFICATION_PREFERENCES_REPOSITORY } from './interfaces/notification-preferences-repository.interface.js';
import { NotificationPreferencesRepository } from './repositories/notification-preferences.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [NotificationPreferencesController],
  providers: [
    NotificationPreferencesService,
    {
      provide: NOTIFICATION_PREFERENCES_REPOSITORY,
      useClass: NotificationPreferencesRepository,
    },
  ],
  exports: [NotificationPreferencesService, NOTIFICATION_PREFERENCES_REPOSITORY],
})
export class NotificationPreferencesModule {}
