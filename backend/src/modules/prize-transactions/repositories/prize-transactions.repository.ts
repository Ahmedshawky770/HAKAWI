import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { prizeTransactions } from '../../../db/schema/prize-transactions.schema.js';
import { db } from '../../../db/index.js';
import type {
  IPrizeTransactionsRepository,
  PrizeTransaction,
  CreatePrizeTransactionData,
  UpdatePrizeTransactionData,
} from '../interfaces/prize-transactions-repository.interface.js';

@Injectable()
export class PrizeTransactionsRepository implements IPrizeTransactionsRepository {
  private readonly logger = new Logger(PrizeTransactionsRepository.name);

  async findById(id: string): Promise<PrizeTransaction | null> {
    this.logger.debug(`Finding prize transaction by id: ${id}`);
    const [transaction] = await db
      .select()
      .from(prizeTransactions)
      .where(eq(prizeTransactions.id, id))
      .limit(1);
    return transaction ?? null;
  }

  async findByContestId(contestId: string): Promise<PrizeTransaction[]> {
    this.logger.debug(`Finding prize transactions by contest: ${contestId}`);
    return db
      .select()
      .from(prizeTransactions)
      .where(eq(prizeTransactions.contestId, contestId))
      .orderBy(desc(prizeTransactions.createdAt));
  }

  async findByUserId(userId: string): Promise<PrizeTransaction[]> {
    this.logger.debug(`Finding prize transactions by user: ${userId}`);
    return db
      .select()
      .from(prizeTransactions)
      .where(eq(prizeTransactions.userId, userId))
      .orderBy(desc(prizeTransactions.createdAt));
  }

  async create(data: CreatePrizeTransactionData): Promise<PrizeTransaction> {
    this.logger.log(
      `Creating prize transaction for contest: ${data.contestId}`,
    );
    const [transaction] = await db
      .insert(prizeTransactions)
      .values(data)
      .returning();
    return transaction;
  }

  async update(
    id: string,
    data: Partial<UpdatePrizeTransactionData>,
  ): Promise<PrizeTransaction> {
    this.logger.debug(`Updating prize transaction: ${id}`);
    const [transaction] = await db
      .update(prizeTransactions)
      .set(data)
      .where(eq(prizeTransactions.id, id))
      .returning();
    return transaction;
  }
}
