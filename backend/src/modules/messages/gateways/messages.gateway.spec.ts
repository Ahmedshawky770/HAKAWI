import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessagesGateway } from './messages.gateway.js';
import { JwtHelper } from '../../common/utils/jwt.util.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { MessagesService } from '../messages.service.js';

type MockJwtHelper = {
  verifyAccessToken: ReturnType<typeof vi.fn>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

type MockMessagesService = {
  getConversations: ReturnType<typeof vi.fn>;
  getMessages: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  markAsRead: ReturnType<typeof vi.fn>;
};

describe('MessagesGateway', () => {
  let gateway: MessagesGateway;
  let jwtHelper: MockJwtHelper;
  let logger: MockWinstonLoggerService;
  let messagesService: MockMessagesService;

  const mockServer = {
    emit: vi.fn(),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  };

  beforeEach(() => {
    jwtHelper = {
      verifyAccessToken: vi.fn(),
    };

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    messagesService = {
      getConversations: vi.fn(),
      getMessages: vi.fn(),
      sendMessage: vi.fn(),
      markAsRead: vi.fn(),
    };

    gateway = new MessagesGateway(
      jwtHelper as unknown as JwtHelper,
      logger as unknown as WinstonLoggerService,
      messagesService as unknown as MessagesService,
    );

    gateway.server = mockServer as never;
  });

  describe('handleConnection', () => {
    it('should connect user with valid token from auth object', async () => {
      jwtHelper.verifyAccessToken.mockReturnValue({ sub: 'user-123', email: 'test@example.com' });

      const client = {
        handshake: {
          auth: { token: 'valid-token' },
          headers: {},
        },
        userId: undefined,
        id: 'socket-1',
        disconnect: vi.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      expect(client.userId).toBe('user-123');
      expect(jwtHelper.verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(mockServer.emit).toHaveBeenCalledWith('user.online', { userId: 'user-123' });
    });

    it('should connect user with valid token from headers', async () => {
      jwtHelper.verifyAccessToken.mockReturnValue({ sub: 'user-123', email: 'test@example.com' });

      const client = {
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer valid-token' },
        },
        userId: undefined,
        id: 'socket-1',
        disconnect: vi.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      expect(client.userId).toBe('user-123');
      expect(jwtHelper.verifyAccessToken).toHaveBeenCalledWith('valid-token');
    });

    it('should reject connection with invalid token', async () => {
      jwtHelper.verifyAccessToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const client = {
        handshake: {
          auth: { token: 'invalid-token' },
          headers: {},
        },
        userId: undefined,
        id: 'socket-1',
        disconnect: vi.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should reject connection with no token', async () => {
      const client = {
        handshake: {
          auth: {},
          headers: {},
        },
        userId: undefined,
        id: 'socket-1',
        disconnect: vi.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should remove user and emit offline event when last socket disconnects', () => {
      (gateway as unknown as { connectedUsers: Map<string, Set<string>> }).connectedUsers.set('user-123', new Set(['socket-1']));

      const client = {
        userId: 'user-123',
        id: 'socket-1',
      } as unknown as Socket;

      gateway.handleDisconnect(client);

      expect((gateway as unknown as { connectedUsers: Map<string, Set<string>> }).connectedUsers.has('user-123')).toBe(false);
      expect(mockServer.emit).toHaveBeenCalledWith('user.offline', { userId: 'user-123' });
    });

    it('should keep user online when other sockets are still connected', () => {
      (gateway as unknown as { connectedUsers: Map<string, Set<string>> }).connectedUsers.set('user-123', new Set(['socket-1', 'socket-2']));

      const client = {
        userId: 'user-123',
        id: 'socket-1',
      } as unknown as Socket;

      gateway.handleDisconnect(client);

      expect((gateway as unknown as { connectedUsers: Map<string, Set<string>> }).connectedUsers.has('user-123')).toBe(true);
      expect(mockServer.emit).not.toHaveBeenCalled();
    });

    it('should do nothing when client has no userId', () => {
      const client = {
        userId: undefined,
        id: 'socket-1',
      } as unknown as Socket;

      gateway.handleDisconnect(client);

      expect(mockServer.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleJoinConversation', () => {
    it('should join conversation room', async () => {
      const client = {
        userId: 'user-123',
        id: 'socket-1',
        join: vi.fn(),
        leave: vi.fn(),
      } as unknown as Socket;

      messagesService.getMessages.mockResolvedValue({
        messages: [],
        total: 0,
      });

      const result = await gateway.handleJoinConversation(client, { conversationId: 'conv-123' });

      expect(client.join).toHaveBeenCalledWith('conv-123');
      expect(result).toEqual({ event: 'joined', data: { conversationId: 'conv-123' } });
    });

    it('should reject joining non-participant conversation', async () => {
      const client = {
        userId: 'user-123',
        id: 'socket-1',
        join: vi.fn(),
      } as unknown as Socket;

      messagesService.getMessages.mockRejectedValue(new Error('Conversation not found'));

      await expect(gateway.handleJoinConversation(client, { conversationId: 'conv-123' })).rejects.toThrow('Conversation not found');
    });

    it('should reject joining without userId', async () => {
      const client = {
        userId: undefined,
        id: 'socket-1',
        join: vi.fn(),
      } as unknown as Socket;

      await expect(gateway.handleJoinConversation(client, { conversationId: 'conv-123' })).rejects.toThrow('Unauthorized');
    });
  });

  describe('handleLeaveConversation', () => {
    it('should leave conversation room', () => {
      const client = {
        userId: 'user-123',
        id: 'socket-1',
        leave: vi.fn(),
      } as unknown as Socket;

      const result = gateway.handleLeaveConversation(client, { conversationId: 'conv-123' });

      expect(client.leave).toHaveBeenCalledWith('conv-123');
      expect(result).toEqual({ event: 'left', data: { conversationId: 'conv-123' } });
    });

    it('should reject leaving without userId', () => {
      const client = {
        userId: undefined,
        id: 'socket-1',
        leave: vi.fn(),
      } as unknown as Socket;

      expect(() => gateway.handleLeaveConversation(client, { conversationId: 'conv-123' })).toThrow('Unauthorized');
    });
  });

  describe('handleSendMessage', () => {
    it('should send message via service', async () => {
      const client = { userId: 'user-123', id: 'socket-1' } as unknown as Socket;
      messagesService.sendMessage.mockResolvedValue({
        id: 'msg-123',
        conversationId: 'conv-123',
        senderId: 'user-123',
        content: 'Hello',
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      const result = await gateway.handleSendMessage(client, { conversationId: 'conv-123', content: 'Hello' });

      expect(messagesService.sendMessage).toHaveBeenCalledWith('conv-123', 'user-123', 'Hello');
      expect(result).toEqual({ event: 'message.sent', data: { messageId: 'msg-123' } });
    });

    it('should reject sending without userId', async () => {
      const client = { userId: undefined, id: 'socket-1' } as unknown as Socket;

      await expect(gateway.handleSendMessage(client, { conversationId: 'conv-123', content: 'Hello' })).rejects.toThrow('Unauthorized');
    });
  });

  describe('handleMarkAsRead', () => {
    it('should mark message as read', async () => {
      const client = { userId: 'user-123', id: 'socket-1' } as unknown as Socket;
      messagesService.markAsRead.mockResolvedValue({
        id: 'msg-123',
        conversationId: 'conv-123',
        senderId: 'user-456',
        content: 'Hello',
        isRead: true,
        readAt: new Date(),
        createdAt: new Date(),
      });

      const result = await gateway.handleMarkAsRead(client, { messageId: 'msg-123' });

      expect(messagesService.markAsRead).toHaveBeenCalledWith('msg-123', 'user-123');
      expect(result).toEqual({ event: 'message.markedAsRead', data: { messageId: 'msg-123' } });
    });

    it('should reject marking as read without userId', async () => {
      const client = { userId: undefined, id: 'socket-1' } as unknown as Socket;

      await expect(gateway.handleMarkAsRead(client, { messageId: 'msg-123' })).rejects.toThrow('Unauthorized');
    });
  });

  describe('handleUserTyping', () => {
    it('should emit typing event to conversation room', () => {
      const client = {
        userId: 'user-123',
        id: 'socket-1',
        to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      } as unknown as Socket;

      gateway.handleUserTyping(client, { conversationId: 'conv-123', isTyping: true });

      expect(client.to).toHaveBeenCalledWith('conv-123');
    });

    it('should reject typing without userId', () => {
      const client = {
        userId: undefined,
        id: 'socket-1',
      } as unknown as Socket;

      expect(() => gateway.handleUserTyping(client, { conversationId: 'conv-123', isTyping: true })).toThrow('Unauthorized');
    });
  });

  describe('emitMessageReceived', () => {
    it('should emit message received to conversation room', () => {
      gateway.emitMessageReceived({
        id: 'msg-123',
        conversationId: 'conv-123',
        senderId: 'user-123',
        content: 'Hello',
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      expect(mockServer.to).toHaveBeenCalledWith('conv-123');
    });
  });

  describe('emitMessageRead', () => {
    it('should emit message read to conversation room', () => {
      gateway.emitMessageRead({
        messageId: 'msg-123',
        conversationId: 'conv-123',
        readBy: 'user-456',
        readAt: new Date().toISOString(),
      });

      expect(mockServer.to).toHaveBeenCalledWith('conv-123');
    });
  });

  describe('emitUserOnline', () => {
    it('should emit user online to all clients', () => {
      gateway.emitUserOnline('user-123');

      expect(mockServer.emit).toHaveBeenCalledWith('user.online', { userId: 'user-123' });
    });
  });

  describe('emitUserOffline', () => {
    it('should emit user offline to all clients', () => {
      gateway.emitUserOffline('user-123');

      expect(mockServer.emit).toHaveBeenCalledWith('user.offline', { userId: 'user-123' });
    });
  });
});
