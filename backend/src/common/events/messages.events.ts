export type MessageReceivedPayload = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
};

export type MessageReadPayload = {
  messageId: string;
  conversationId: string;
  readBy: string;
  readAt: string | null;
};

export type UserTypingPayload = {
  userId: string;
  conversationId: string;
  isTyping: boolean;
};

export type UserOnlinePayload = {
  userId: string;
};

export type UserOfflinePayload = {
  userId: string;
};
