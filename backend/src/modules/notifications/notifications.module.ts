import { Module } from '@nestjs/common';
import { NotificationsService } from './services/notifications.service.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { NotificationsRepository } from './repositories/notifications.repository.js';

@Module({
  imports: [],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  exports: [NotificationsService],
})
export class NotificationsModule {}
