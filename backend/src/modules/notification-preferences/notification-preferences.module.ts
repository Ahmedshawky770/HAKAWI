import { Module } from '@nestjs/common';
import { NotificationPreferencesService } from './services/notification-preferences.service.js';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller.js';
import { NotificationPreferencesRepository } from './repositories/notification-preferences.repository.js';

@Module({
  imports: [],
  controllers: [NotificationPreferencesController],
  providers: [NotificationPreferencesService, NotificationPreferencesRepository],
  exports: [NotificationPreferencesService],
})
export class NotificationPreferencesModule {}
