import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageReadReceiptsService } from './message-read-receipts.service.js';
import type { MessageReadReceiptsRepository } from '../repositories/message-read-receipts.repository.js';
import { NotFoundException, ConflictException } from '@nestjs/common';

type MockMessageReadReceiptsRepository = Partial<MessageReadReceiptsRepository>;

const createMockMessageReadReceipt = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'receipt-123',
  messageId: 'message-123',
  userId: 'user-123',
  conversationId: 'conversation-123',
  readAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('MessageReadReceiptsService', () => {
  let messageReadReceiptsService: MessageReadReceiptsService;
  let messageReadReceiptsRepository: MockMessageReadReceiptsRepository;

  beforeEach(() => {
    messageReadReceiptsRepository = {
      findById: vi.fn(),
      findByMessageId: vi.fn(),
      findByMessageAndUser: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    };

    messageReadReceiptsService = new MessageReadReceiptsService(
      messageReadReceiptsRepository as MessageReadReceiptsRepository,
    );
  });

  describe('findById', () => {
    it('should return read receipt when found', async () => {
      const receipt = createMockMessageReadReceipt();
      vi.mocked(messageReadReceiptsRepository.findById).mockResolvedValue(receipt as any);

      const result = await messageReadReceiptsService.findById('receipt-123');

      expect(result).toEqual(receipt);
    });

    it('should throw NotFoundException when read receipt not found', async () => {
      vi.mocked(messageReadReceiptsRepository.findById).mockResolvedValue(null);

      await expect(messageReadReceiptsService.findById('receipt-123')).rejects.toThrow('Message read receipt not found');
    });
  });

  describe('create', () => {
    it('should create read receipt when not exists', async () => {
      const receipt = createMockMessageReadReceipt();
      vi.mocked(messageReadReceiptsRepository.findByMessageAndUser).mockResolvedValue(null);
      vi.mocked(messageReadReceiptsRepository.create).mockResolvedValue(receipt as any);

      const result = await messageReadReceiptsService.create('message-123', 'user-123');

      expect(result).toEqual(receipt);
    });

    it('should return existing receipt when already exists', async () => {
      const receipt = createMockMessageReadReceipt();
      vi.mocked(messageReadReceiptsRepository.findByMessageAndUser).mockResolvedValue(receipt as any);

      const result = await messageReadReceiptsService.create('message-123', 'user-123');

      expect(result).toEqual(receipt);
      expect(messageReadReceiptsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findByMessageId', () => {
    it('should return read receipts by message', async () => {
      const receipts = [createMockMessageReadReceipt()];
      vi.mocked(messageReadReceiptsRepository.findByMessageId).mockResolvedValue(receipts as any);

      const result = await messageReadReceiptsService.findByMessageId('message-123');

      expect(result).toEqual(receipts);
    });
  });
});
