import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import type { IMessagesRepository, CreateMessageData, UpdateMessageData } from '../interfaces/messages-repository.interface.js';
import { MESSAGES_REPOSITORY } from '../interfaces/messages-repository.interface.js';
import { MessagesRepository } from '../repositories/messages.repository.js';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @Inject(MESSAGES_REPOSITORY) private readonly messagesRepository: MessagesRepository,
  ) {}

  async findById(id: string): Promise<CreateMessageData> {
    const message = await this.messagesRepository.findById(id);
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return message;
  }

  async findByConversationId(conversationId: string): Promise<CreateMessageData[]> {
    return this.messagesRepository.findByConversationId(conversationId);
  }

  async create(conversationId: string, senderId: string, content: string): Promise<CreateMessageData> {
    if (!content.trim()) {
      throw new BadRequestException('Message content cannot be empty');
    }
    return this.messagesRepository.create({ conversationId, senderId, content });
  }

  async delete(id: string, userId: string): Promise<void> {
    const message = await this.messagesRepository.findById(id);
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    if (message.senderId !== userId) {
      throw new BadRequestException('You can only delete your own messages');
    }
    await this.messagesRepository.delete(id);
  }
}
