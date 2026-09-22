import { symbol } from '../../common/utils/symbol.util.js';
import type { MessageReadReceipt } from '../../../db/schema/message-read-receipts.schema.js';
import type { NewMessageReadReceipt } from '../../../db/schema/message-read-receipts.schema.js';

export const MESSAGE_READ_RECEIPTS_REPOSITORY = symbol('MESSAGE_READ_RECEIPTS_REPOSITORY');

export type CreateMessageReadReceiptData = NewMessageReadReceipt;

export { MessageReadReceipt };

export interface IMessageReadReceiptsRepository {
  findById(id: string): Promise<MessageReadReceipt | null>;
  findByMessageAndUser(messageId: string, userId: string): Promise<MessageReadReceipt | null>;
  create(data: CreateMessageReadReceiptData): Promise<MessageReadReceipt>;
  findByMessageId(messageId: string): Promise<MessageReadReceipt[]>;
}
