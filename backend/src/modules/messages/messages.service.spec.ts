import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { MessagesService } from './messages.service.ts';
import type {
  Conversation,
  CreateConversationInput,
  IncomingUnreadByConversation,
  LastMessagesByConversation,
  Message,
  CreateMessageInput,
  ParticipantSummary,
} from './interfaces/messages-repository.interface.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockConversationsRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Conversation | null>>>;
  findByParticipants: ReturnType<
    typeof vi.fn<(participant1Id: string, participant2Id: string) => Promise<Conversation | null>>
  >;
  findByUser: ReturnType<
    typeof vi.fn<
      (userId: string, page: number, limit: number) => Promise<{ conversations: Conversation[]; total: number }>
    >
  >;
  create: ReturnType<typeof vi.fn<(data: CreateConversationInput) => Promise<Conversation>>>;
  updateLastMessage: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  findParticipantsByIds: ReturnType<typeof vi.fn<(ids: string[]) => Promise<ParticipantSummary[]>>>;
};
type MockMessagesRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Message | null>>>;
  findByConversation: ReturnType<
    typeof vi.fn<
      (conversationId: string, page: number, limit: number) => Promise<{ messages: Message[]; total: number }>
    >
  >;
  create: ReturnType<typeof vi.fn<(data: CreateMessageInput) => Promise<Message>>>;
  markAsRead: ReturnType<typeof vi.fn<(id: string) => Promise<Message>>>;
  markAllAsRead: ReturnType<typeof vi.fn<(conversationId: string, userId: string) => Promise<void>>>;
  countUnread: ReturnType<typeof vi.fn<(conversationId: string, userId: string) => Promise<number>>>;
  findLastByConversations: ReturnType<
    typeof vi.fn<(conversationIds: readonly string[]) => Promise<LastMessagesByConversation>>
  >;
  countIncomingUnreadByConversations: ReturnType<
    typeof vi.fn<
      (conversationIds: readonly string[], senderIds: readonly string[]) => Promise<IncomingUnreadByConversation>
    >
  >;
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

const CONVERSATION: Conversation = {
  id: 'conv-123',
  participant1Id: 'user-1',
  participant2Id: 'user-2',
  lastMessageAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-123',
    conversationId: 'conv-123',
    senderId: 'user-1',
    content: 'Hello!',
    isRead: false,
    readAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

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
      findByUser:
        vi.fn<
          (userId: string, page: number, limit: number) => Promise<{ conversations: Conversation[]; total: number }>
        >(),
      create: vi.fn<(data: CreateConversationInput) => Promise<Conversation>>(),
      updateLastMessage: vi.fn<(id: string) => Promise<void>>(),
      findParticipantsByIds: vi.fn<(ids: string[]) => Promise<ParticipantSummary[]>>(),
    };

    messagesRepository = {
      findById: vi.fn<(id: string) => Promise<Message | null>>(),
      findByConversation:
        vi.fn<
          (conversationId: string, page: number, limit: number) => Promise<{ messages: Message[]; total: number }>
        >(),
      create: vi.fn<(data: CreateMessageInput) => Promise<Message>>(),
      markAsRead: vi.fn<(id: string) => Promise<Message>>(),
      markAllAsRead: vi.fn<(conversationId: string, userId: string) => Promise<void>>(),
      countUnread: vi.fn<(conversationId: string, userId: string) => Promise<number>>(),
      findLastByConversations: vi.fn<(conversationIds: readonly string[]) => Promise<LastMessagesByConversation>>(),
      countIncomingUnreadByConversations:
        vi.fn<
          (conversationIds: readonly string[], senderIds: readonly string[]) => Promise<IncomingUnreadByConversation>
        >(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    eventValidatorService = { emit: vi.fn(), validateEvent: vi.fn() };

    messagesService = new MessagesService(
      conversationsRepository,
      messagesRepository,
      logger as unknown as WinstonLoggerService,
      eventValidatorService as unknown as EventValidatorService,
    );

    vi.mocked(conversationsRepository.findParticipantsByIds).mockResolvedValue([]);
    vi.mocked(messagesRepository.findLastByConversations).mockResolvedValue(new Map());
    vi.mocked(messagesRepository.countIncomingUnreadByConversations).mockResolvedValue(new Map());
  });

  describe('getOrCreateConversation', () => {
    it('should create a new conversation if not exists', async () => {
      vi.mocked(conversationsRepository.findByParticipants).mockResolvedValue(null);
      vi.mocked(conversationsRepository.create).mockResolvedValue({
        id: 'conv-123',
        participant1Id: 'user-1',
        participant2Id: 'user-2',
        lastMessageAt: null,
        createdAt: new Date(),
      });

      const result = await messagesService.getOrCreateConversation('user-1', 'user-2');

      expect(result.id).toBe('conv-123');
      expect(conversationsRepository.create).toHaveBeenCalledWith({
        participant1Id: 'user-1',
        participant2Id: 'user-2',
      });
    });

    it('should reuse the existing conversation instead of creating a second one', async () => {
      vi.mocked(conversationsRepository.findByParticipants).mockResolvedValue(CONVERSATION);

      const result = await messagesService.getOrCreateConversation('user-1', 'user-2');

      expect(result).toBe(CONVERSATION);
      expect(conversationsRepository.create).not.toHaveBeenCalled();
    });

    it('should look the pair up in a canonical order regardless of who asked', async () => {
      // This test used to assert the opposite — that the lookup preserved the caller's order —
      // and that title was the defect's name. `idx_conversations_unique` is on the ORDERED pair,
      // so A→B then B→A looked up `(B, A)`, missed the existing `(A, B)` row, and inserted a
      // second conversation for the same two people, with its own message history.
      vi.mocked(conversationsRepository.findByParticipants).mockResolvedValue(null);
      vi.mocked(conversationsRepository.create).mockResolvedValue(CONVERSATION);

      await messagesService.getOrCreateConversation('user-2', 'user-1');

      expect(conversationsRepository.findByParticipants).toHaveBeenCalledWith('user-1', 'user-2');
      expect(conversationsRepository.create).toHaveBeenCalledWith({
        participant1Id: 'user-1',
        participant2Id: 'user-2',
      });
    });

    it('should resolve to the same conversation whichever side asks first', async () => {
      vi.mocked(conversationsRepository.findByParticipants).mockResolvedValue(CONVERSATION);

      await messagesService.getOrCreateConversation('user-1', 'user-2');
      await messagesService.getOrCreateConversation('user-2', 'user-1');

      expect(conversationsRepository.findByParticipants).toHaveBeenNthCalledWith(1, 'user-1', 'user-2');
      expect(conversationsRepository.findByParticipants).toHaveBeenNthCalledWith(2, 'user-1', 'user-2');
      expect(conversationsRepository.create).not.toHaveBeenCalled();
    });

    it('should refuse a conversation with yourself', async () => {
      // `countUnread` and `markAllAsRead` select `sender_id <> userId`. With both participants
      // the same person that predicate matches nothing, so the unread badge would read 0 forever
      // and "mark all read" would be a silent no-op. Refusing the row keeps the negation exact.
      await expect(messagesService.getOrCreateConversation('user-1', 'user-1')).rejects.toThrow(
        'Cannot start a conversation with yourself',
      );

      expect(conversationsRepository.findByParticipants).not.toHaveBeenCalled();
      expect(conversationsRepository.create).not.toHaveBeenCalled();
    });

    it('should return the winner row when it loses the insert race', async () => {
      // Two concurrent, identically-ordered creates: the unique index catches the loser, and the
      // winner's row is what both callers get. A retry of the write would not converge; a re-read
      // does.
      vi.mocked(conversationsRepository.findByParticipants)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(CONVERSATION);
      vi.mocked(conversationsRepository.create).mockRejectedValue(
        Object.assign(new Error('duplicate key'), {
          code: '23505',
        }),
      );

      const result = await messagesService.getOrCreateConversation('user-1', 'user-2');

      expect(result).toBe(CONVERSATION);
      expect(conversationsRepository.findByParticipants).toHaveBeenCalledTimes(2);
    });

    it('should rethrow an insert failure that is not a unique violation', async () => {
      // A connection loss must stay a 500. Swallowing it into "try again" would hide the fault.
      vi.mocked(conversationsRepository.findByParticipants).mockResolvedValue(null);
      vi.mocked(conversationsRepository.create).mockRejectedValue(new Error('connection terminated'));

      await expect(messagesService.getOrCreateConversation('user-1', 'user-2')).rejects.toThrow(
        'connection terminated',
      );
    });
  });

  describe('sendMessage', () => {
    it('should send a message', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue({
        id: 'conv-123',
        participant1Id: 'user-1',
        participant2Id: 'user-2',
        lastMessageAt: null,
        createdAt: new Date(),
      });
      vi.mocked(messagesRepository.create).mockResolvedValue({
        id: 'msg-123',
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: 'Hello!',
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      const result = await messagesService.sendMessage('conv-123', 'user-1', 'Hello!');

      expect(result.content).toBe('Hello!');
      expect(conversationsRepository.updateLastMessage).toHaveBeenCalledWith('conv-123');
      // `recipientId` is asserted because it is the whole reason the field exists. It used to be
      // derived by the notifications consumer reading the `conversations` table — a cross-aggregate
      // read from a module that does not own that schema (Principle #7), re-reading a row this
      // method had already loaded to validate participation (Principle #9).
      expect(eventValidatorService.emit).toHaveBeenCalledWith('message.sent', {
        messageId: 'msg-123',
        conversationId: 'conv-123',
        senderId: 'user-1',
        recipientId: 'user-2',
      });
    });

    it('should name the recipient whichever side of the conversation the sender is on', async () => {
      // The conversation is stored as an ordered pair, so deriving the recipient by assuming the
      // sender is `participant1Id` would notify the sender instead whenever the sender happens to be
      // participant 2.
      vi.mocked(conversationsRepository.findById).mockResolvedValue({
        id: 'conv-123',
        participant1Id: 'user-2',
        participant2Id: 'user-1',
        lastMessageAt: null,
        createdAt: new Date(),
      });
      vi.mocked(messagesRepository.create).mockResolvedValue({
        id: 'msg-123',
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: 'Hello!',
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      await messagesService.sendMessage('conv-123', 'user-1', 'Hello!');

      expect(eventValidatorService.emit).toHaveBeenCalledWith(
        'message.sent',
        expect.objectContaining({ senderId: 'user-1', recipientId: 'user-2' }),
      );
    });

    it('should persist the conversation, sender and content it was given', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.create).mockResolvedValue(message());

      await messagesService.sendMessage('conv-123', 'user-1', 'Hello!');

      expect(messagesRepository.create).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: 'Hello!',
      });
    });

    it.each([
      { role: 'first participant', senderId: 'user-1' },
      { role: 'second participant', senderId: 'user-2' },
    ])('should let the $role send into the conversation', async ({ senderId }) => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.create).mockResolvedValue(message({ senderId }));

      const result = await messagesService.sendMessage('conv-123', senderId, 'Hello!');

      expect(result.senderId).toBe(senderId);
    });

    it('should reject a user who is not a participant of the conversation', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);

      await expect(messagesService.sendMessage('conv-123', 'attacker-999', 'let me in')).rejects.toThrow(
        NotFoundException,
      );
      await expect(messagesService.sendMessage('conv-123', 'attacker-999', 'let me in')).rejects.toThrow(
        'Conversation not found',
      );
    });

    it('should not persist or announce anything when a non-participant tries to send', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);

      await expect(messagesService.sendMessage('conv-123', 'attacker-999', 'let me in')).rejects.toThrow();

      expect(messagesRepository.create).not.toHaveBeenCalled();
      expect(conversationsRepository.updateLastMessage).not.toHaveBeenCalled();
      expect(eventValidatorService.emit).not.toHaveBeenCalled();
    });

    it('should reject a send into a conversation that does not exist', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(null);

      await expect(messagesService.sendMessage('missing-conv', 'user-1', 'Hello!')).rejects.toThrow(
        'Conversation not found',
      );
      expect(messagesRepository.create).not.toHaveBeenCalled();
    });

    it('should not accept an empty conversation id', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(null);

      await expect(messagesService.sendMessage('', 'user-1', 'Hello!')).rejects.toThrow(NotFoundException);
    });

    it('should treat a user id that merely contains a participant id as a stranger', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);

      await expect(messagesService.sendMessage('conv-123', 'user-10', 'Hello!')).rejects.toThrow(
        'Conversation not found',
      );
    });
  });

  describe('getMessages', () => {
    it('should return the messages and the total for a participant', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.findByConversation).mockResolvedValue({ messages: [message()], total: 1 });

      const result = await messagesService.getMessages('conv-123', 'user-1');

      expect(result.total).toBe(1);
      expect(result.messages[0]?.id).toBe('msg-123');
    });

    it('should serialise the timestamps and read state', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.findByConversation).mockResolvedValue({
        messages: [message({ isRead: true, readAt: new Date('2026-01-02T03:04:05.000Z') })],
        total: 1,
      });

      const result = await messagesService.getMessages('conv-123', 'user-1');

      expect(result.messages[0]).toEqual({
        id: 'msg-123',
        conversationId: 'conv-123',
        senderId: 'user-1',
        content: 'Hello!',
        isRead: true,
        readAt: '2026-01-02T03:04:05.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('should return a null readAt for an unread message', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.findByConversation).mockResolvedValue({ messages: [message()], total: 1 });

      const result = await messagesService.getMessages('conv-123', 'user-1');

      expect(result.messages[0]?.readAt).toBeNull();
    });

    it('should default to the first page of fifty and forward the requested page', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.findByConversation).mockResolvedValue({ messages: [], total: 0 });

      await messagesService.getMessages('conv-123', 'user-1');
      expect(messagesRepository.findByConversation).toHaveBeenCalledWith('conv-123', 1, 50);

      await messagesService.getMessages('conv-123', 'user-1', 4, 10);
      expect(messagesRepository.findByConversation).toHaveBeenLastCalledWith('conv-123', 4, 10);
    });

    it('should preserve the order the repository returned', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.findByConversation).mockResolvedValue({
        messages: [message({ id: 'msg-3' }), message({ id: 'msg-2' }), message({ id: 'msg-1' })],
        total: 3,
      });

      const result = await messagesService.getMessages('conv-123', 'user-1');

      expect(result.messages.map((row) => row.id)).toEqual(['msg-3', 'msg-2', 'msg-1']);
    });

    it('should reject a non-participant', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);

      await expect(messagesService.getMessages('conv-123', 'attacker-999')).rejects.toThrow(NotFoundException);
      await expect(messagesService.getMessages('conv-123', 'attacker-999')).rejects.toThrow('Conversation not found');
    });

    it('should not read a single message for a non-participant', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);

      await expect(messagesService.getMessages('conv-123', 'attacker-999')).rejects.toThrow();

      expect(messagesRepository.findByConversation).not.toHaveBeenCalled();
    });

    it('should reject a read of a conversation that does not exist', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(null);

      await expect(messagesService.getMessages('missing-conv', 'user-1')).rejects.toThrow('Conversation not found');
    });
  });

  describe('markAsRead', () => {
    it('should mark a message the other participant sent as read', async () => {
      vi.mocked(messagesRepository.findById).mockResolvedValue(message({ senderId: 'user-2' }));
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.markAsRead).mockResolvedValue(
        message({ senderId: 'user-2', isRead: true, readAt: new Date() }),
      );

      const result = await messagesService.markAsRead('msg-123', 'user-1');

      expect(result.isRead).toBe(true);
      expect(messagesRepository.markAsRead).toHaveBeenCalledWith('msg-123');
    });

    it('should emit message.read with the conversation and the reader', async () => {
      vi.mocked(messagesRepository.findById).mockResolvedValue(message({ senderId: 'user-2' }));
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.markAsRead).mockResolvedValue(message({ senderId: 'user-2', isRead: true }));

      await messagesService.markAsRead('msg-123', 'user-1');

      expect(eventValidatorService.emit).toHaveBeenCalledWith('message.read', {
        messageId: 'msg-123',
        conversationId: 'conv-123',
        readBy: 'user-1',
      });
    });

    it('should reject a message that does not exist', async () => {
      vi.mocked(messagesRepository.findById).mockResolvedValue(null);

      await expect(messagesService.markAsRead('missing-msg', 'user-1')).rejects.toThrow(NotFoundException);
      await expect(messagesService.markAsRead('missing-msg', 'user-1')).rejects.toThrow('Message not found');
      expect(messagesRepository.markAsRead).not.toHaveBeenCalled();
    });

    it('should reject a sender marking their own message as read', async () => {
      vi.mocked(messagesRepository.findById).mockResolvedValue(message({ senderId: 'user-1' }));

      await expect(messagesService.markAsRead('msg-123', 'user-1')).rejects.toThrow(BadRequestException);
      await expect(messagesService.markAsRead('msg-123', 'user-1')).rejects.toThrow('Cannot mark own message as read');
      expect(messagesRepository.markAsRead).not.toHaveBeenCalled();
    });

    it('should reject a user who is not a participant of the message conversation', async () => {
      vi.mocked(messagesRepository.findById).mockResolvedValue(message({ senderId: 'user-2' }));
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);

      await expect(messagesService.markAsRead('msg-123', 'attacker-999')).rejects.toThrow(ForbiddenException);
      expect(messagesRepository.markAsRead).not.toHaveBeenCalled();
    });

    it('should not mutate or announce anything for a non-participant', async () => {
      vi.mocked(messagesRepository.findById).mockResolvedValue(message({ senderId: 'user-2' }));
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);

      await expect(messagesService.markAsRead('msg-123', 'attacker-999')).rejects.toThrow();

      expect(messagesRepository.markAsRead).not.toHaveBeenCalled();
      expect(eventValidatorService.emit).not.toHaveBeenCalled();
    });

    it.each([
      { role: 'first participant', userId: 'user-1' },
      { role: 'second participant', userId: 'user-2' },
    ])('should let the $role read a message from the other side', async ({ userId }) => {
      const otherId = userId === 'user-1' ? 'user-2' : 'user-1';
      vi.mocked(messagesRepository.findById).mockResolvedValue(message({ senderId: otherId }));
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.markAsRead).mockResolvedValue(message({ senderId: otherId, isRead: true }));

      await expect(messagesService.markAsRead('msg-123', userId)).resolves.toMatchObject({ isRead: true });
    });

    it('should reject a read when the conversation row is gone', async () => {
      vi.mocked(messagesRepository.findById).mockResolvedValue(message({ senderId: 'user-2' }));
      vi.mocked(conversationsRepository.findById).mockResolvedValue(null);

      await expect(messagesService.markAsRead('msg-123', 'user-1')).rejects.toThrow(ForbiddenException);
      expect(messagesRepository.markAsRead).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark every message in the conversation as read for a participant', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);

      await messagesService.markAllAsRead('conv-123', 'user-1');

      expect(messagesRepository.markAllAsRead).toHaveBeenCalledWith('conv-123', 'user-1');
    });

    it('should reject a non-participant', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);

      await expect(messagesService.markAllAsRead('conv-123', 'attacker-999')).rejects.toThrow(NotFoundException);
      await expect(messagesService.markAllAsRead('conv-123', 'attacker-999')).rejects.toThrow('Conversation not found');
    });

    it('should not mark a single message when a non-participant tries', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);

      await expect(messagesService.markAllAsRead('conv-123', 'attacker-999')).rejects.toThrow();

      expect(messagesRepository.markAllAsRead).not.toHaveBeenCalled();
    });

    it('should reject a conversation that does not exist', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(null);

      await expect(messagesService.markAllAsRead('missing-conv', 'user-1')).rejects.toThrow('Conversation not found');
    });
  });

  describe('getUnreadCount', () => {
    it('should return the unread count for a participant', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.countUnread).mockResolvedValue(4);

      await expect(messagesService.getUnreadCount('conv-123', 'user-1')).resolves.toBe(4);
      expect(messagesRepository.countUnread).toHaveBeenCalledWith('conv-123', 'user-1');
    });

    it('should return zero for a fully read conversation', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);
      vi.mocked(messagesRepository.countUnread).mockResolvedValue(0);

      await expect(messagesService.getUnreadCount('conv-123', 'user-1')).resolves.toBe(0);
    });

    it('should reject a non-participant', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(CONVERSATION);

      await expect(messagesService.getUnreadCount('conv-123', 'attacker-999')).rejects.toThrow(NotFoundException);
      expect(messagesRepository.countUnread).not.toHaveBeenCalled();
    });

    it('should reject a conversation that does not exist', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue(null);

      await expect(messagesService.getUnreadCount('missing-conv', 'user-1')).rejects.toThrow('Conversation not found');
    });
  });

  describe('getConversations', () => {
    it('should map each conversation and keep the total', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({ conversations: [CONVERSATION], total: 1 });

      const result = await messagesService.getConversations('user-1');

      expect(result.total).toBe(1);
      expect(result.conversations[0]).toEqual({
        id: 'conv-123',
        participant1Id: 'user-1',
        participant2Id: 'user-2',
        participant: { id: 'user-2', name: null },
        lastMessage: undefined,
        unreadCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('should report the other participant name resolved from the participants join', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({ conversations: [CONVERSATION], total: 1 });
      vi.mocked(conversationsRepository.findParticipantsByIds).mockResolvedValue([
        { id: 'user-1', name: 'First Participant' },
        { id: 'user-2', name: 'Second Participant' },
      ]);

      const result = await messagesService.getConversations('user-1');

      expect(result.conversations[0]?.participant).toEqual({ id: 'user-2', name: 'Second Participant' });
    });

    it('should ask for every participant of the page exactly once', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({
        conversations: [
          CONVERSATION,
          { ...CONVERSATION, id: 'conv-456', participant1Id: 'user-3', participant2Id: 'user-4' },
        ],
        total: 2,
      });

      await messagesService.getConversations('user-1');

      expect(conversationsRepository.findParticipantsByIds).toHaveBeenCalledTimes(1);
      expect(conversationsRepository.findParticipantsByIds).toHaveBeenCalledWith([
        'user-1',
        'user-2',
        'user-3',
        'user-4',
      ]);
    });

    it('should report the real unread count of messages the other participant sent', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({ conversations: [CONVERSATION], total: 1 });
      vi.mocked(messagesRepository.countIncomingUnreadByConversations).mockResolvedValue(new Map([['conv-123', 3]]));

      const result = await messagesService.getConversations('user-1');

      expect(result.conversations[0]?.unreadCount).toBe(3);
      expect(messagesRepository.countIncomingUnreadByConversations).toHaveBeenCalledWith(['conv-123'], ['user-2']);
    });

    it('should include the last message when the conversation has one', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({
        conversations: [CONVERSATION],
        total: 1,
      });
      vi.mocked(messagesRepository.findLastByConversations).mockResolvedValue(
        new Map([
          [
            'conv-123',
            message({ id: 'msg-last', content: 'Latest words', createdAt: new Date('2026-01-05T06:07:08.000Z') }),
          ],
        ]),
      );

      const result = await messagesService.getConversations('user-1');

      expect(result.conversations[0]?.lastMessage).toEqual({
        content: 'Latest words',
        createdAt: '2026-01-05T06:07:08.000Z',
      });
    });

    it('should omit the last message when the conversation has never been used', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({ conversations: [CONVERSATION], total: 1 });

      const result = await messagesService.getConversations('user-1');

      expect(result.conversations[0]?.lastMessage).toBeUndefined();
    });

    it('should forward the requested page and limit', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({ conversations: [], total: 0 });

      await messagesService.getConversations('user-1', 2, 5);

      expect(conversationsRepository.findByUser).toHaveBeenCalledWith('user-1', 2, 5);
    });

    it('should default to the first page of twenty', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({ conversations: [], total: 0 });

      await messagesService.getConversations('user-1');

      expect(conversationsRepository.findByUser).toHaveBeenCalledWith('user-1', 1, 20);
    });

    it('should return an empty list for a user with no conversations', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({ conversations: [], total: 0 });

      await expect(messagesService.getConversations('user-1')).resolves.toEqual({
        conversations: [],
        total: 0,
        page: 1,
        limit: 20,
      });
    });

    it('should not query the participants join for an empty page', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({ conversations: [], total: 0 });

      await messagesService.getConversations('user-1');

      expect(conversationsRepository.findParticipantsByIds).not.toHaveBeenCalled();
    });

    it('should describe the other participant rather than the requesting user', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({ conversations: [CONVERSATION], total: 1 });

      const result = await messagesService.getConversations('user-1');

      expect(result.conversations[0]?.participant.id).not.toBe('user-1');
      expect(result.conversations[0]?.participant.id).toBe('user-2');
    });

    it('should describe the other participant when the viewer is participant two', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({ conversations: [CONVERSATION], total: 1 });

      const result = await messagesService.getConversations('user-2');

      expect(result.conversations[0]?.participant.id).toBe('user-1');
      expect(messagesRepository.countIncomingUnreadByConversations).toHaveBeenCalledWith(['conv-123'], ['user-1']);
    });

    it('should ask for every participant of the page in one query, not one per conversation', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({
        conversations: [CONVERSATION, { ...CONVERSATION, id: 'conv-456' }],
        total: 2,
      });

      await messagesService.getConversations('user-1');

      expect(messagesRepository.findLastByConversations).toHaveBeenCalledTimes(1);
      expect(messagesRepository.findLastByConversations).toHaveBeenCalledWith(['conv-123', 'conv-456']);
      expect(messagesRepository.countIncomingUnreadByConversations).toHaveBeenCalledTimes(1);
    });

    it('should not query the messages tables at all for an empty page', async () => {
      vi.mocked(conversationsRepository.findByUser).mockResolvedValue({ conversations: [], total: 0 });

      await messagesService.getConversations('user-1');

      expect(messagesRepository.findLastByConversations).not.toHaveBeenCalled();
      expect(messagesRepository.countIncomingUnreadByConversations).not.toHaveBeenCalled();
    });

    it('should not let the number of queries grow with the page size', async () => {
      // A counting fake: every repository call bumps one counter, so the assertion below is
      // about round trips rather than about which method was called.
      let queries = 0;
      const countingConversations: MockConversationsRepository = {
        ...conversationsRepository,
        findByUser: vi.fn(async (userId: string, page: number, limit: number) => {
          queries += 1;
          return {
            conversations: Array.from({ length: limit }, (_unused, index) => ({
              ...CONVERSATION,
              id: `conv-${index}`,
              participant1Id: userId,
              participant2Id: `user-${index}`,
            })),
            total: limit,
          };
        }),
        findParticipantsByIds: vi.fn(async () => {
          queries += 1;
          return [];
        }),
      };
      const countingMessages: MockMessagesRepository = {
        ...messagesRepository,
        findLastByConversations: vi.fn(async () => {
          queries += 1;
          return new Map();
        }),
        countIncomingUnreadByConversations: vi.fn(async () => {
          queries += 1;
          return new Map();
        }),
      };
      const counting = new MessagesService(
        countingConversations,
        countingMessages,
        logger as unknown as WinstonLoggerService,
        eventValidatorService as unknown as EventValidatorService,
      );

      await counting.getConversations('user-1', 1, 5);
      const fiveConversations = queries;

      queries = 0;
      await counting.getConversations('user-1', 1, 40);
      const fortyConversations = queries;

      // Four repository calls, whatever the page holds. Per-conversation enrichment cost
      // 1 + 2N calls instead: 11 for five conversations, 81 for forty.
      expect(fiveConversations).toBe(4);
      expect(fortyConversations).toBe(fiveConversations);
    });
  });
});
