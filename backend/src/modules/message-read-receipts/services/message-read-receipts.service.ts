import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import type { IMessageReadReceiptsRepository, CreateMessageReadReceiptData } from '../interfaces/message-read-receipts-repository.interface.js';
import { MESSAGE_READ_RECEIPTS_REPOSITORY } from '../interfaces/message-read-receipts-repository.interface.js';
import { MessageReadReceiptsRepository } from '../repositories/message-read-receipts.repository.js';

@Injectable()
export class MessageReadReceiptsService {
  private readonly logger = new Logger(MessageReadReceiptsService.name);

  constructor(
    @Inject(MESSAGE_READ_RECEIPTS_REPOSITORY) private readonly receiptsRepository: MessageReadReceiptsRepository,
  ) {}

  async findById(id: string): Promise<CreateMessageReadReceiptData> {
    const receipt = await this.receiptsRepository.findById(id);
    if (!receipt) {
      throw new NotFoundException('Message read receipt not found');
    }
    return receipt;
  }

  async create(messageId: string, userId: string): Promise<CreateMessageReadReceiptData> {
    const existing = await this.receiptsRepository.findByMessageAndUser(messageId, userId);
    if (existing) {
      return existing;
    }
    return this.receiptsRepository.create({ messageId, userId });
  }

  async findByMessageId(messageId: string): Promise<CreateMessageReadReceiptData[]> {
    return this.receiptsRepository.findByMessageId(messageId);
  }
}
