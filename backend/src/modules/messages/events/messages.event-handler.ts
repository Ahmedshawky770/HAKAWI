import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { MessageSentEvent, MessageReadEvent } from '../../../common/events/social.events.ts';
import type { IMessagesRepository } from '../interfaces/messages-repository.interface.ts';
import { MESSAGES_REPOSITORY } from '../interfaces/messages-repository.interface.ts';
import { MessagesGateway } from '../gateways/messages.gateway.ts';

@Injectable()
export class MessagesEventHandler {
  constructor(
    @Inject(MESSAGES_REPOSITORY) private readonly messagesRepository: IMessagesRepository,
    private readonly logger: WinstonLoggerService,
    private readonly messagesGateway: MessagesGateway,
  ) {}

  @OnEvent('message.sent')
  async handleMessageSent(event: MessageSentEvent): Promise<void> {
    this.logger.info(`Message ${event.messageId} sent in conversation ${event.conversationId} by user ${event.senderId}`, 'MessagesEventHandler');

    const message = await this.messagesRepository.findById(event.messageId);
    if (message) {
      this.messagesGateway.emitMessageReceived({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,
        isRead: message.isRead,
        readAt: message.readAt,
        createdAt: message.createdAt,
      });
    }
  }

  @OnEvent('message.read')
  async handleMessageRead(event: MessageReadEvent): Promise<void> {
    this.logger.info(`Message ${event.messageId} marked as read in conversation ${event.conversationId} by user ${event.readBy}`, 'MessagesEventHandler');

    const message = await this.messagesRepository.findById(event.messageId);
    if (message) {
      this.messagesGateway.emitMessageRead({
        messageId: message.id,
        conversationId: message.conversationId,
        readBy: event.readBy,
        readAt: message.readAt?.toISOString() || null,
      });
    }
  }
}
