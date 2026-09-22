import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessagesService } from './messages.service.js';
import type { MessagesRepository } from '../repositories/messages.repository.js';
import { NotFoundException, BadRequestException } from '@nestjs/common';

type MockMessagesRepository = Partial<MessagesRepository>;

const createMockMessage = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'message-123',
  conversationId: 'conversation-123',
  senderId: 'user-1',
  content: 'Hello',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('MessagesService', () => {
  let messagesService: MessagesService;
  let messagesRepository: MockMessagesRepository;

  beforeEach(() => {
    messagesRepository = {
      findById: vi.fn(),
      findByConversationId: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    };

    messagesService = new MessagesService(
      messagesRepository as MessagesRepository,
    );
  });

  describe('findById', () => {
    it('should return message when found', async () => {
      const message = createMockMessage();
      vi.mocked(messagesRepository.findById).mockResolvedValue(message as any);

      const result = await messagesService.findById('message-123');

      expect(result).toEqual(message);
    });

    it('should throw NotFoundException when message not found', async () => {
      vi.mocked(messagesRepository.findById).mockResolvedValue(null);

      await expect(messagesService.findById('message-123')).rejects.toThrow('Message not found');
    });
  });

  describe('findByConversationId', () => {
    it('should return messages by conversation', async () => {
      const messages = [createMockMessage()];
      vi.mocked(messagesRepository.findByConversationId).mockResolvedValue(messages as any);

      const result = await messagesService.findByConversationId('conversation-123');

      expect(result).toEqual(messages);
    });
  });

  describe('create', () => {
    it('should create message successfully', async () => {
      const message = createMockMessage();
      vi.mocked(messagesRepository.create).mockResolvedValue(message as any);

      const result = await messagesService.create('conversation-123', 'user-1', 'Hello');

      expect(result).toEqual(message);
    });

    it('should throw BadRequestException when content is empty', async () => {
      await expect(messagesService.create('conversation-123', 'user-1', '   ')).rejects.toThrow('Message content cannot be empty');
    });

    it('should throw BadRequestException when content is whitespace only', async () => {
      await expect(messagesService.create('conversation-123', 'user-1', '\t\n')).rejects.toThrow('Message content cannot be empty');
    });
  });

  describe('delete', () => {
    it('should delete message when user is sender', async () => {
      const message = createMockMessage({ senderId: 'user-1' });
      vi.mocked(messagesRepository.findById).mockResolvedValue(message as any);
      vi.mocked(messagesRepository.delete).mockResolvedValue(undefined as any);

      await messagesService.delete('message-123', 'user-1');

      expect(messagesRepository.delete).toHaveBeenCalledWith('message-123');
    });

    it('should throw NotFoundException when message not found', async () => {
      vi.mocked(messagesRepository.findById).mockResolvedValue(null);

      await expect(messagesService.delete('message-123', 'user-1')).rejects.toThrow('Message not found');
    });

    it('should throw BadRequestException when user is not sender', async () => {
      const message = createMockMessage({ senderId: 'user-2' });
      vi.mocked(messagesRepository.findById).mockResolvedValue(message as any);

      await expect(messagesService.delete('message-123', 'user-1')).rejects.toThrow('You can only delete your own messages');
    });
  });
});
