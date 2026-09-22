export interface IMessageReadReceiptsRepository {
  findById(id: string): Promise<MessageReadReceipt | null>;
  findByMessageAndUser(messageId: string, userId: string): Promise<MessageReadReceipt | null>;
  create(data: CreateMessageReadReceiptData): Promise<MessageReadReceipt>;
  findByMessageId(messageId: string): Promise<MessageReadReceipt[]>;
}

export interface MessageReadReceipt {
  id: string;
  messageId: string;
  userId: string;
  readAt: Date;
}

export interface CreateMessageReadReceiptData {
  messageId: string;
  userId: string;
}

export const MESSAGE_READ_RECEIPTS_REPOSITORY = 'MESSAGE_READ_RECEIPTS_REPOSITORY';
