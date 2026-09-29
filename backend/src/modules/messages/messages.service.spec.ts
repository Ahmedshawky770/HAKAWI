import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { MessagesService } from './messages.service.ts';
import type { IConversationsRepository, Conversation, CreateConversationInput } from './interfaces/messages-repository.interface.ts';
import type { IMessagesRepository, Message, CreateMessageInput } from './interfaces/messages-repository.interface.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockConversationsRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Conversation | null>>>;
  findByParticipants: ReturnType<typeof vi.fn<(participant1Id: string, participant2Id: string) => Promise<Conversation | null>>>;
  findByUser: ReturnType<typeof vi.fn<(userId: string, page: number, limit: number) => Promise<{ conversations: Conversation[]; total: number }>>>;
  create: ReturnType<typeof vi.fn<(data: CreateConversationInput) => Promise<Conversation>>>;
  updateLastMessage: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
};
type MockMessagesRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Message | null>>>;
  findByConversation: ReturnType<typeof vi.fn<(conversationId: string, page: number, limit: number) => Promise<{ messages: Message[]; total: number }>>>;
  create: ReturnType<typeof vi.fn<(data: CreateMessageInput) => Promise<Message>>>;
  markAsRead: ReturnType<typeof vi.fn<(id: string) => Promise<Message>>>;
  markAllAsRead: ReturnType<typeof vi.fn<(conversationId: string, userId: string) => Promise<void>>>;
  countUnread: ReturnType<typeof vi.fn<(conversationId: string, userId: string) => Promise<number>>>;
};
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};
type MockEventValidatorService = { emit: ReturnType<typeof vi.fn>; validateEvent: ReturnType<typeof vi.fn> };

describe('MessagesService', () => {
  let messagesService: MessagesService;
  let conversationsRepository: MockConversationsRepository;
  let messagesRepository: MockMessagesRepository;
  let logger: MockWinstonLoggerService;
  let eventValidatorService: MockEventValidatorService;

  beforeEach(() => {
    conversationsRepository = {
      findById: vi.fn<(id: string) => Promise<Conversation | null>>(),
      findByParticipants: vi.fn<(participant1Id: string, participant2Id: string) => Promise<Conversation | null>>(),
      findByUser: vi.fn<(userId: string, page: number, limit: number) => Promise<{ conversations: Conversation[]; total: number }>>(),
      create: vi.fn<(data: CreateConversationInput) => Promise<Conversation>>(),
      updateLastMessage: vi.fn<(id: string) => Promise<void>>(),
    };

    messagesRepository = {
      findById: vi.fn<(id: string) => Promise<Message | null>>(),
      findByConversation: vi.fn<(conversationId: string, page: number, limit: number) => Promise<{ messages: Message[]; total: number }>>(),
      create: vi.fn<(data: CreateMessageInput) => Promise<Message>>(),
      markAsRead: vi.fn<(id: string) => Promise<Message>>(),
      markAllAsRead: vi.fn<(conversationId: string, userId: string) => Promise<void>>(),
      countUnread: vi.fn<(conversationId: string, userId: string) => Promise<number>>(),
    };

    logger = {
      info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn(),
    };

    eventValidatorService = { emit: vi.fn(), validateEvent: vi.fn() };

    messagesService = new MessagesService(
      conversationsRepository,
      messagesRepository,
      logger as unknown as WinstonLoggerService,
      eventValidatorService as unknown as EventValidatorService,
    );
  });

  describe('getOrCreateConversation', () => {
    it('should create a new conversation if not exists', async () => {
      vi.mocked(conversationsRepository.findByParticipants).mockResolvedValue(null);
      vi.mocked(conversationsRepository.create).mockResolvedValue({
        id: 'conv-123', participant1Id: 'user-1', participant2Id: 'user-2', lastMessageAt: null, createdAt: new Date(),
      });

      const result = await messagesService.getOrCreateConversation('user-1', 'user-2');

      expect(result.id).toBe('conv-123');
      expect(conversationsRepository.create).toHaveBeenCalledWith({ participant1Id: 'user-1', participant2Id: 'user-2' });
    });
  });

  describe('sendMessage', () => {
    it('should send a message', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue({
        id: 'conv-123', participant1Id: 'user-1', participant2Id: 'user-2', lastMessageAt: null, createdAt: new Date(),
      });
      vi.mocked(messagesRepository.create).mockResolvedValue({
        id: 'msg-123', conversationId: 'conv-123', senderId: 'user-1', content: 'Hello!', isRead: false, readAt: null, createdAt: new Date(),
      });

      const result = await messagesService.sendMessage('conv-123', 'user-1', 'Hello!');

      expect(result.content).toBe('Hello!');
      expect(conversationsRepository.updateLastMessage).toHaveBeenCalledWith('conv-123');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('message.sent', { messageId: 'msg-123', conversationId: 'conv-123', senderId: 'user-1' });
    });
  });
});
