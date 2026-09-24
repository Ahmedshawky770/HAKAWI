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
