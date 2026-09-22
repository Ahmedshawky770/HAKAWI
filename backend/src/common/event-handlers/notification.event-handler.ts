import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ValkeyService } from '../../common/services/valkey.service.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';

@Injectable()
export class NotificationEventHandler {
  private readonly logger: Logger;

  constructor(
    private readonly valkeyService: ValkeyService,
    private readonly winstonLogger: WinstonLoggerService,
  ) {
    this.logger = new Logger(NotificationEventHandler.name);
  }

  @OnEvent('notification.created')
  async handleNotificationCreated(event: { notificationId: string; userId: string; type: string; actorId?: string; entityId?: string }): Promise<void> {
    this.winstonLogger.log(`Notification created: ${event.notificationId} for user ${event.userId}`, 'NotificationEventHandler');
    await this.valkeyService.set(`notification:${event.notificationId}`, JSON.stringify(event), 3600);
  }
}
