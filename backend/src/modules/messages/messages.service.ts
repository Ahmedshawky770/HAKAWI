import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { MessageSentEvent, MessageReadEvent } from '../../common/events/social.events.ts';

import type { IConversationsRepository } from './interfaces/messages-repository.interface.ts';
import { CONVERSATIONS_REPOSITORY } from './interfaces/messages-repository.interface.ts';
import type { IMessagesRepository } from './interfaces/messages-repository.interface.ts';
import { MESSAGES_REPOSITORY } from './interfaces/messages-repository.interface.ts';
import type { Conversation, Message, CreateMessageInput, ConversationResponse, MessageResponse } from './types.ts';

interface ConversationRow {
  id: string;
  participant1Id: string;
  participant2Id: string;
  lastMessageAt: Date | null;
  createdAt: Date;
}

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class MessagesService {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversationsRepository: IConversationsRepository,
    @Inject(MESSAGES_REPOSITORY) private readonly messagesRepository: IMessagesRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async getOrCreateConversation(userId: string, recipientId: string): Promise<Conversation> {
    let conversation = await this.conversationsRepository.findByParticipants(userId, recipientId);
    if (!conversation) {
      conversation = await this.conversationsRepository.create({
        participant1Id: userId,
        participant2Id: recipientId,
      });
    }
    return conversation;
  }

  async getConversations(userId: string, page = 1, limit = 20): Promise<{ conversations: ConversationResponse[]; total: number }> {
    const result = await this.conversationsRepository.findByUser(userId, page, limit);
    return {
      conversations: result.conversations.map((conv: ConversationRow) => this.toConversationResponse(conv)),
      total: result.total,
    };
  }

  async getMessages(conversationId: string, userId: string, page = 1, limit = 50): Promise<{ messages: MessageResponse[]; total: number }> {
    const conversation = await this.conversationsRepository.findById(conversationId);
    if (!conversation || (conversation.participant1Id !== userId && conversation.participant2Id !== userId)) {
      throw new NotFoundException('Conversation not found');
    }

    const result = await this.messagesRepository.findByConversation(conversationId, page, limit);
    return {
      messages: result.messages.map((msg: MessageRow) => this.toMessageResponse(msg)),
      total: result.total,
    };
  }

  async sendMessage(conversationId: string, senderId: string, content: string): Promise<Message> {
    const conversation = await this.conversationsRepository.findById(conversationId);
    if (!conversation || (conversation.participant1Id !== senderId && conversation.participant2Id !== senderId)) {
      throw new NotFoundException('Conversation not found');
    }

    const message = await this.messagesRepository.create({
      conversationId,
      senderId,
      content,
    });

    await this.conversationsRepository.updateLastMessage(conversationId);
    await this.eventBus.emit('message.sent', { messageId: message.id, conversationId, senderId } as MessageSentEvent);

    return message;
  }

  async markAsRead(messageId: string, userId: string): Promise<Message> {
    const message = await this.messagesRepository.findById(messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    if (message.senderId === userId) {
      throw new BadRequestException('Cannot mark own message as read');
    }

    const updated = await this.messagesRepository.markAsRead(messageId);
    await this.eventBus.emit('message.read', { messageId, conversationId: updated.conversationId, readBy: userId } as MessageReadEvent);
    return updated;
  }

  async markAllAsRead(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.conversationsRepository.findById(conversationId);
    if (!conversation || (conversation.participant1Id !== userId && conversation.participant2Id !== userId)) {
      throw new NotFoundException('Conversation not found');
    }

    await this.messagesRepository.markAllAsRead(conversationId, userId);
  }

  async getUnreadCount(conversationId: string, userId: string): Promise<number> {
    const conversation = await this.conversationsRepository.findById(conversationId);
    if (!conversation || (conversation.participant1Id !== userId && conversation.participant2Id !== userId)) {
      throw new NotFoundException('Conversation not found');
    }

    return this.messagesRepository.countUnread(conversationId, userId);
  }

  private toMessageResponse(message: MessageRow): MessageResponse {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      isRead: message.isRead,
      readAt: message.readAt?.toISOString() || null,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private toConversationResponse(conversation: ConversationRow): ConversationResponse {
    const otherParticipantId = conversation.participant1Id;
    return {
      id: conversation.id,
      participant1Id: conversation.participant1Id,
      participant2Id: conversation.participant2Id,
      participant: { id: otherParticipantId, name: '' },
      lastMessage: conversation.lastMessageAt ? { content: '', createdAt: conversation.lastMessageAt.toISOString() } : undefined,
      unreadCount: 0,
      createdAt: conversation.createdAt.toISOString(),
    };
  }
}
