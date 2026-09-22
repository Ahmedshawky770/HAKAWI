import { symbol } from '../../common/utils/symbol.util.js';
import type { Message } from '../../../db/schema/messages.schema.js';
import type { NewMessage } from '../../../db/schema/messages.schema.js';

export const MESSAGES_REPOSITORY = symbol('MESSAGES_REPOSITORY');

export type CreateMessageData = NewMessage;
export type UpdateMessageData = Partial<CreateMessageData>;

export { Message };

export interface IMessagesRepository {
  findById(id: string): Promise<Message | null>;
  findByConversationId(conversationId: string): Promise<Message[]>;
  create(data: CreateMessageData): Promise<Message>;
  update(id: string, data: Partial<UpdateMessageData>): Promise<Message>;
  delete(id: string): Promise<void>;
  markAsRead(messageId: string, userId: string): Promise<void>;
  getUnreadCount(conversationId: string, userId: string): Promise<number>;
}
