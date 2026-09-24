import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { NotificationCreatedEvent } from '../../../common/events/social.events.ts';
import type { INotificationsRepository } from '../interfaces/notifications-repository.interface.ts';
import { NOTIFICATIONS_REPOSITORY } from '../interfaces/notifications-repository.interface.ts';

@Injectable()
export class NotificationsEventHandler {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notificationsRepository: INotificationsRepository,
    private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('notification.created')
  async handleNotificationCreated(event: NotificationCreatedEvent): Promise<void> {
    this.logger.info(`Notification ${event.notificationId} created for user ${event.userId} of type ${event.type}`, 'NotificationsEventHandler');
  }
}
