export interface IMessagesRepository {
  findById(id: string): Promise<Message | null>;
  findByConversationId(conversationId: string): Promise<Message[]>;
  create(data: CreateMessageData): Promise<Message>;
  update(id: string, data: Partial<UpdateMessageData>): Promise<Message>;
  delete(id: string): Promise<void>;
  markAsRead(messageId: string, userId: string): Promise<void>;
  getUnreadCount(conversationId: string, userId: string): Promise<number>;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageData {
  conversationId: string;
  senderId: string;
  content: string;
  deletedAt?: Date | null;
}

export interface UpdateMessageData extends Partial<Pick<Message, 'deletedAt'>> {}

export const MESSAGES_REPOSITORY = 'MESSAGES_REPOSITORY';
