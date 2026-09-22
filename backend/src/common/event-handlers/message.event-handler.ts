import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';

@Injectable()
export class MessageEventHandler {
  private readonly logger: Logger;

  constructor(private readonly winstonLogger: WinstonLoggerService) {
    this.logger = new Logger(MessageEventHandler.name);
  }

  @OnEvent('message.created')
  async handleMessageCreated(event: { messageId: string; conversationId: string; senderId: string }): Promise<void> {
    this.winstonLogger.log(`Message created: ${event.messageId} in conversation ${event.conversationId}`, 'MessageEventHandler');
  }
}
