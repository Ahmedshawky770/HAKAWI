import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { messageReadReceipts } from '../../../db/schema/message-read-receipts.schema.js';
import { db } from '../../../db/index.js';
import type {
  IMessageReadReceiptsRepository,
  MessageReadReceipt,
  CreateMessageReadReceiptData,
} from '../interfaces/message-read-receipts-repository.interface.js';

@Injectable()
export class MessageReadReceiptsRepository implements IMessageReadReceiptsRepository {
  private readonly logger = new Logger(MessageReadReceiptsRepository.name);

  async findById(id: string): Promise<MessageReadReceipt | null> {
    this.logger.debug(`Finding message read receipt by id: ${id}`);
    const [receipt] = await db
      .select()
      .from(messageReadReceipts)
      .where(eq(messageReadReceipts.id, id))
      .limit(1);
    return receipt ?? null;
  }

  async findByMessageAndUser(
    messageId: string,
    userId: string,
  ): Promise<MessageReadReceipt | null> {
    this.logger.debug(
      `Finding message read receipt by message and user: ${messageId} / ${userId}`,
    );
    const [receipt] = await db
      .select()
      .from(messageReadReceipts)
      .where(
        and(
          eq(messageReadReceipts.messageId, messageId),
          eq(messageReadReceipts.userId, userId),
        ),
      )
      .limit(1);
    return receipt ?? null;
  }

  async create(
    data: CreateMessageReadReceiptData,
  ): Promise<MessageReadReceipt> {
    this.logger.info(
      `Creating message read receipt for message: ${data.messageId}`,
    );
    const [receipt] = await db
      .insert(messageReadReceipts)
      .values(data)
      .returning();
    return receipt;
  }

  async findByMessageId(messageId: string): Promise<MessageReadReceipt[]> {
    this.logger.debug(`Finding message read receipts by message: ${messageId}`);
    return db
      .select()
      .from(messageReadReceipts)
      .where(eq(messageReadReceipts.messageId, messageId))
      .orderBy(desc(messageReadReceipts.readAt));
  }
}
