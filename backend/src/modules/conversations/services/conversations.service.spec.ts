import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationsService } from './conversations.service.js';
import type { ConversationsRepository } from '../repositories/conversations.repository.js';
import type { MessagesRepository } from '../../messages/repositories/messages.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

type MockConversationsRepository = Partial<ConversationsRepository>;
type MockMessagesRepository = Partial<MessagesRepository>;
type MockEventEmitter2 = Partial<EventEmitter2>;

const createMockConversation = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'conversation-123',
  participantIds: ['user-1', 'user-2'],
  lastMessageAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockMessage = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'message-123',
  conversationId: 'conversation-123',
  senderId: 'user-1',
  content: 'Hello',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ConversationsService', () => {
  let conversationsService: ConversationsService;
  let conversationsRepository: MockConversationsRepository;
  let messagesRepository: MockMessagesRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    conversationsRepository = {
      findById: vi.fn(),
      findByParticipantId: vi.fn(),
      findByParticipants: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    messagesRepository = {
      findById: vi.fn(),
      findByConversationId: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    conversationsService = new ConversationsService(
      conversationsRepository as ConversationsRepository,
      messagesRepository as MessagesRepository,
      eventEmitter as EventEmitter2,
    );
  });

  describe('findById', () => {
    it('should return conversation when found', async () => {
      const conversation = createMockConversation();
      vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation as any);

      const result = await conversationsService.findById('conversation-123');

      expect(result).toEqual(conversation);
    });

    it('should throw NotFoundException when conversation not found', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(null);

      await expect(conversationsService.findById('conversation-123')).rejects.toThrow('Conversation not found');
    });
  });

  describe('findByParticipantId', () => {
    it('should return conversations by participant', async () => {
      const conversations = [createMockConversation()];
      vi.mocked(conversationsRepository.findByParticipantId).mockResolvedValue(conversations as any);

      const result = await conversationsService.findByParticipantId('user-1');

      expect(result).toEqual(conversations);
    });
  });

  describe('create', () => {
    it('should create conversation successfully', async () => {
      const conversation = createMockConversation();
      vi.mocked(conversationsRepository.findByParticipants).mockResolvedValue(null);
      vi.mocked(conversationsRepository.create).mockResolvedValue(conversation as any);

      const result = await conversationsService.create(['user-1', 'user-2']);

      expect(result).toEqual(conversation);
    });

    it('should throw BadRequestException when less than 2 participants', async () => {
      await expect(conversationsService.create(['user-1'])).rejects.toThrow('Conversation must have at least 2 participants');
    });

    it('should throw ConflictException when conversation already exists', async () => {
      vi.mocked(conversationsRepository.findByParticipants).mockResolvedValue(createMockConversation() as any);

      await expect(conversationsService.create(['user-1', 'user-2'])).rejects.toThrow('Conversation already exists');
    });
  });

  describe('getMessages', () => {
    it('should return messages for conversation participant', async () => {
      const conversation = createMockConversation({ participantIds: ['user-1', 'user-2'] });
      const messages = [createMockMessage()];
      vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation as any);
      vi.mocked(messagesRepository.findByConversationId).mockResolvedValue(messages as any);

      const result = await conversationsService.getMessages('conversation-123', 'user-1');

      expect(result).toEqual(messages);
    });

    it('should throw NotFoundException when conversation not found', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(null);

      await expect(conversationsService.getMessages('conversation-123', 'user-1')).rejects.toThrow('Conversation not found');
    });

    it('should throw BadRequestException when user is not a participant', async () => {
      const conversation = createMockConversation({ participantIds: ['user-1', 'user-2'] });
      vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation as any);

      await expect(conversationsService.getMessages('conversation-123', 'user-3')).rejects.toThrow('You are not a participant of this conversation');
    });
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      const conversation = createMockConversation({ participantIds: ['user-1', 'user-2'] });
      const message = createMockMessage();
      vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation as any);
      vi.mocked(messagesRepository.create).mockResolvedValue(message as any);
      vi.mocked(conversationsRepository.update).mockResolvedValue(undefined as any);

      const result = await conversationsService.sendMessage('conversation-123', 'user-1', 'Hello');

      expect(result).toEqual(message);
      expect(eventEmitter.emit).toHaveBeenCalledWith('message.created', {
        messageId: 'message-123',
        senderId: 'user-1',
        recipientId: '',
        content: 'Hello',
      });
      expect(conversationsRepository.update).toHaveBeenCalledWith('conversation-123', { lastMessageAt: expect.any(Date) });
    });

    it('should throw NotFoundException when conversation not found', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(null);

      await expect(conversationsService.sendMessage('conversation-123', 'user-1', 'Hello'))
        .rejects.toThrow('Conversation not found');
    });

    it('should throw BadRequestException when user is not a participant', async () => {
      const conversation = createMockConversation({ participantIds: ['user-1', 'user-2'] });
      vi.mocked(conversationsRepository.findById).mockResolvedValue(conversation as any);

      await expect(conversationsService.sendMessage('conversation-123', 'user-3', 'Hello'))
        .rejects.toThrow('You are not a participant of this conversation');
    });
  });
});
