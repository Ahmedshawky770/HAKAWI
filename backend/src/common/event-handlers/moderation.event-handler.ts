import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';

@Injectable()
export class ModerationEventHandler {
  private readonly logger: Logger;

  constructor(private readonly winstonLogger: WinstonLoggerService) {
    this.logger = new Logger(ModerationEventHandler.name);
  }

  @OnEvent('content.moderation_action')
  async handleModerationAction(event: { moderatorId: string; action: string; targetId: string; targetType: string; reason: string }): Promise<void> {
    this.winstonLogger.log(`Moderation action: ${event.action} on ${event.targetType}:${event.targetId}`, 'ModerationEventHandler');
  }
}
