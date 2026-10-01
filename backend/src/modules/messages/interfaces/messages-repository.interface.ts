export const CONVERSATIONS_REPOSITORY = Symbol('CONVERSATIONS_REPOSITORY');
export const MESSAGES_REPOSITORY = Symbol('MESSAGES_REPOSITORY');

export type Conversation = {
  id: string;
  participant1Id: string;
  participant2Id: string;
  lastMessageAt: Date | null;
  createdAt: Date;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
};

export type CreateConversationInput = {
  participant1Id: string;
  participant2Id: string;
};

export type CreateMessageInput = {
  conversationId: string;
  senderId: string;
  content: string;
};

export type MessageResponse = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type ConversationResponse = {
  id: string;
  participant1Id: string;
  participant2Id: string;
  participant: {
    id: string;
    name: string;
  };
  lastMessage?: {
    content: string;
    createdAt: string;
  };
  unreadCount: number;
  createdAt: string;
};

export type ParticipantSummary = {
  id: string;
  name: string;
};

export interface IConversationsRepository {
  findById(id: string): Promise<Conversation | null>;
  findByParticipants(participant1Id: string, participant2Id: string): Promise<Conversation | null>;
  findByUser(userId: string, page: number, limit: number): Promise<{ conversations: Conversation[]; total: number }>;
  create(data: CreateConversationInput): Promise<Conversation>;
  updateLastMessage(id: string): Promise<void>;
  findParticipantsByIds(ids: string[]): Promise<ParticipantSummary[]>;
}

/**
 * The newest message of each conversation on a page, keyed by conversation id.
 *
 * Batch method rather than `findLastByConversation(conversationId)`: the conversation list is
 * paginated, so a per-conversation lookup turns one request into `1 + 2N` queries — 41 extra
 * round trips at the default page size of twenty.
 */
export type LastMessagesByConversation = ReadonlyMap<string, Message>;

/**
 * Unread messages per conversation, keyed by conversation id.
 *
 * `senderIds` is the set of *other* participants across the page. A conversation has exactly
 * one other participant, so filtering the whole page on `sender_id = ANY(senderIds)` selects
 * the same rows a per-conversation filter would, in one grouped query.
 */
export type IncomingUnreadByConversation = ReadonlyMap<string, number>;

export interface IMessagesRepository {
  findById(id: string): Promise<Message | null>;
  findByConversation(
    conversationId: string,
    page: number,
    limit: number,
  ): Promise<{ messages: Message[]; total: number }>;
  create(data: CreateMessageInput): Promise<Message>;
  markAsRead(id: string): Promise<Message>;
  markAllAsRead(conversationId: string, userId: string): Promise<void>;
  countUnread(conversationId: string, userId: string): Promise<number>;
  findLastByConversations(conversationIds: readonly string[]): Promise<LastMessagesByConversation>;
  countIncomingUnreadByConversations(
    conversationIds: readonly string[],
    senderIds: readonly string[],
  ): Promise<IncomingUnreadByConversation>;
}
