import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { MessageSentEvent, MessageReadEvent } from '../../common/events/social.events.ts';

import type { IConversationsRepository, ParticipantSummary } from './interfaces/messages-repository.interface.ts';
import { CONVERSATIONS_REPOSITORY } from './interfaces/messages-repository.interface.ts';
import type { IMessagesRepository } from './interfaces/messages-repository.interface.ts';
import { MESSAGES_REPOSITORY } from './interfaces/messages-repository.interface.ts';
import type { Conversation, Message, ConversationResponse, MessageResponse } from './types.ts';

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

  async getConversations(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ conversations: ConversationResponse[]; total: number; page: number; limit: number }> {
    const result = await this.conversationsRepository.findByUser(userId, page, limit);
    const conversations: ConversationRow[] = result.conversations;

    if (conversations.length === 0) {
      return { conversations: [], total: result.total, page, limit };
    }

    const participantIds = [...new Set(conversations.flatMap((conv) => [conv.participant1Id, conv.participant2Id]))];
    const otherParticipantIds = conversations.map((conv) => this.otherParticipantId(conv, userId));

    // Three fixed queries for the whole page. Enriching per conversation in a loop instead —
    // two lookups each — made the request cost `1 + 2N` round trips, 41 of them at the default
    // page size of twenty, so the cost of a page grew with its size.
    const [participants, lastByConversation, unreadByConversation] = await Promise.all([
      this.conversationsRepository.findParticipantsByIds(participantIds),
      this.messagesRepository.findLastByConversations(conversations.map((conv) => conv.id)),
      this.messagesRepository.countIncomingUnreadByConversations(
        conversations.map((conv) => conv.id),
        [...new Set(otherParticipantIds)],
      ),
    ]);
    const namesById = new Map<string, string>(participants.map((entry: ParticipantSummary) => [entry.id, entry.name]));

    const responses = conversations.map((conv, index) =>
      this.toConversationResponse(
        conv,
        namesById,
        otherParticipantIds[index] ?? userId,
        lastByConversation.get(conv.id),
        unreadByConversation.get(conv.id) ?? 0,
      ),
    );

    return { conversations: responses, total: result.total, page, limit };
  }

  async getMessages(
    conversationId: string,
    userId: string,
    page = 1,
    limit = 50,
  ): Promise<{ messages: MessageResponse[]; total: number; page: number; limit: number }> {
    const conversation = await this.conversationsRepository.findById(conversationId);
    if (!conversation || (conversation.participant1Id !== userId && conversation.participant2Id !== userId)) {
      throw new NotFoundException('Conversation not found');
    }

    const result = await this.messagesRepository.findByConversation(conversationId, page, limit);
    return {
      messages: result.messages.map((msg: MessageRow) => this.toMessageResponse(msg)),
      total: result.total,
      page,
      limit,
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

    const conversation = await this.conversationsRepository.findById(message.conversationId);
    if (!conversation || (conversation.participant1Id !== userId && conversation.participant2Id !== userId)) {
      throw new ForbiddenException('You are not a participant of this conversation');
    }

    const updated = await this.messagesRepository.markAsRead(messageId);
    await this.eventBus.emit('message.read', {
      messageId,
      conversationId: updated.conversationId,
      readBy: userId,
    } as MessageReadEvent);
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

  private otherParticipantId(conversation: ConversationRow, viewerId: string): string {
    return conversation.participant1Id === viewerId ? conversation.participant2Id : conversation.participant1Id;
  }

  /**
   * Builds one row of the conversation list from values already fetched for the whole page.
   *
   * Pure and synchronous by design: anything it needed per conversation would have to be
   * awaited here, which is exactly the `Promise.all` fan-out this method used to perform.
   */
  private toConversationResponse(
    conversation: ConversationRow,
    namesById: Map<string, string>,
    otherId: string,
    lastMessage: MessageRow | undefined,
    unreadCount: number,
  ): ConversationResponse {
    return {
      id: conversation.id,
      participant1Id: conversation.participant1Id,
      participant2Id: conversation.participant2Id,
      participant: { id: otherId, name: namesById.get(otherId) ?? null },
      lastMessage: lastMessage
        ? { content: lastMessage.content, createdAt: lastMessage.createdAt.toISOString() }
        : undefined,
      unreadCount,
      createdAt: conversation.createdAt.toISOString(),
    };
  }
}
