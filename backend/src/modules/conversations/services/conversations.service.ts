import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IConversationsRepository, CreateConversationData, UpdateConversationData } from '../interfaces/conversations-repository.interface.js';
import { CONVERSATIONS_REPOSITORY } from '../interfaces/conversations-repository.interface.js';
import { ConversationsRepository } from '../repositories/conversations.repository.js';
import type { IMessagesRepository, CreateMessageData } from '../../messages/interfaces/messages-repository.interface.js';
import { MESSAGES_REPOSITORY } from '../../messages/interfaces/messages-repository.interface.js';
import { MessagesRepository } from '../../messages/repositories/messages.repository.js';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversationsRepository: ConversationsRepository,
    @Inject(MESSAGES_REPOSITORY) private readonly messagesRepository: MessagesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string): Promise<CreateConversationData> {
    const conversation = await this.conversationsRepository.findById(id);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  async findByParticipantId(userId: string): Promise<CreateConversationData[]> {
    return this.conversationsRepository.findByParticipantId(userId);
  }

  async create(participantIds: string[]): Promise<CreateConversationData> {
    if (participantIds.length < 2) {
      throw new BadRequestException('Conversation must have at least 2 participants');
    }

    const existing = await this.conversationsRepository.findByParticipants(participantIds);
    if (existing) {
      throw new ConflictException('Conversation already exists');
    }

    const conversation = await this.conversationsRepository.create({ participantIds });
    return conversation;
  }

  async getMessages(conversationId: string, userId: string): Promise<CreateMessageData[]> {
    await this.verifyParticipant(conversationId, userId);
    return this.messagesRepository.findByConversationId(conversationId);
  }

  async sendMessage(conversationId: string, senderId: string, content: string): Promise<CreateMessageData> {
    await this.verifyParticipant(conversationId, senderId);
    const message = await this.messagesRepository.create({ conversationId, senderId, content });
    await this.conversationsRepository.update(conversationId, { lastMessageAt: new Date() });
    this.eventEmitter.emit('message.created', { messageId: message.id, senderId, recipientId: '', content });
    return message;
  }

  private async verifyParticipant(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.conversationsRepository.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (!conversation.participantIds.includes(userId)) {
      throw new BadRequestException('You are not a participant of this conversation');
    }
  }
}
