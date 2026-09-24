import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessagesEventHandler } from './messages.event-handler.js';
import type { IMessagesRepository } from '../interfaces/messages-repository.interface.js';
import { MESSAGES_REPOSITORY } from '../interfaces/messages-repository.interface.js';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.js';
import { MessageSentEvent, MessageReadEvent } from '../../../common/events/social.events.js';
import { MessagesGateway } from '../gateways/messages.gateway.js';

describe('MessagesEventHandler', () => {
  let messagesEventHandler: MessagesEventHandler;
  let messagesRepository: Partial<IMessagesRepository>;
  let logger: Partial<WinstonLoggerService>;
  let messagesGateway: Partial<MessagesGateway>;

  beforeEach(() => {
    messagesRepository = {
      findById: vi.fn(),
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

      expect(logger.info).toHaveBeenCalledWith('Message msg-123 sent in conversation conv-123 by user user-1', 'MessagesEventHandler');
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

      expect(logger.info).toHaveBeenCalledWith('Message msg-123 marked as read in conversation conv-123 by user user-2', 'MessagesEventHandler');
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
