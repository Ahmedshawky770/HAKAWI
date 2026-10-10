import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { IMessagesRepository, Message } from '../interfaces/messages-repository.interface.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { MessageSentEvent, MessageReadEvent } from '../../../common/events/social.events.ts';
import { MessagesGateway } from '../gateways/messages.gateway.ts';

import { MessagesEventHandler } from './messages.event-handler.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockMessagesRepository = {
  findById: ReturnType<typeof vi.fn>;
  findByConversation: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  markAsRead: ReturnType<typeof vi.fn>;
  markAllAsRead: ReturnType<typeof vi.fn>;
  countUnread: ReturnType<typeof vi.fn>;
};
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};
type MockMessagesGateway = {
  emitMessageReceived: ReturnType<typeof vi.fn>;
  emitMessageRead: ReturnType<typeof vi.fn>;
};

describe('MessagesEventHandler', () => {
  let messagesEventHandler: MessagesEventHandler;
  let messagesRepository: MockMessagesRepository;
  let logger: MockWinstonLoggerService;
  let messagesGateway: MockMessagesGateway;

  beforeEach(() => {
    messagesRepository = {
      findById: vi.fn(),
      findByConversation: vi.fn(),
      create: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      countUnread: vi.fn(),
    };

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    messagesGateway = {
      emitMessageReceived: vi.fn(),
      emitMessageRead: vi.fn(),
    };

    messagesEventHandler = new MessagesEventHandler(
      messagesRepository as unknown as IMessagesRepository,
      logger as unknown as WinstonLoggerService,
      messagesGateway as unknown as MessagesGateway,
    );
  });

  describe('handleMessageSent', () => {
    it('should log and emit WebSocket event', async () => {
      const message = {
        id: 'msg-123',
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: 'Hello',
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      };

      vi.mocked(messagesRepository.findById).mockResolvedValue(message);

      await messagesEventHandler.handleMessageSent(new MessageSentEvent('msg-123', 'conv-123', 'user-1'));

      expect(logger.info).toHaveBeenCalledWith(
        'Message msg-123 sent in conversation conv-123 by user user-1',
        'MessagesEventHandler',
      );
      expect(messagesGateway.emitMessageReceived).toHaveBeenCalledWith(message);
    });

    it('should not emit WebSocket event when message is not found', async () => {
      vi.mocked(messagesRepository.findById).mockResolvedValue(null);

      await messagesEventHandler.handleMessageSent(new MessageSentEvent('msg-123', 'conv-123', 'user-1'));

      expect(logger.info).toHaveBeenCalled();
      expect(messagesGateway.emitMessageReceived).not.toHaveBeenCalled();
    });
  });

  describe('handleMessageRead', () => {
    it('should log and emit WebSocket event', async () => {
      const readAt = '2024-01-01T00:00:00.000Z';
      const message = {
        id: 'msg-123',
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: 'Hello',
        isRead: true,
        readAt: new Date(readAt),
        createdAt: new Date(),
      };

      vi.mocked(messagesRepository.findById).mockResolvedValue(message);

      await messagesEventHandler.handleMessageRead(new MessageReadEvent('msg-123', 'conv-123', 'user-2'));

      expect(logger.info).toHaveBeenCalledWith(
        'Message msg-123 marked as read in conversation conv-123 by user user-2',
        'MessagesEventHandler',
      );
      expect(messagesGateway.emitMessageRead).toHaveBeenCalledWith({
        messageId: 'msg-123',
        conversationId: 'conv-123',
        readBy: 'user-2',
        readAt: readAt,
      });
    });

    it('should not emit WebSocket event when message is not found', async () => {
      vi.mocked(messagesRepository.findById).mockResolvedValue(null);

      await messagesEventHandler.handleMessageRead(new MessageReadEvent('msg-123', 'conv-123', 'user-2'));

      expect(logger.info).toHaveBeenCalled();
      expect(messagesGateway.emitMessageRead).not.toHaveBeenCalled();
    });
  });
});
