import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { transactions } from '../../../db/schema/transactions.schema.js';
import { db } from '../../../db/index.js';
import type {
  ITransactionsRepository,
  Transaction,
  CreateTransactionData,
} from '../interfaces/transactions-repository.interface.js';

@Injectable()
export class TransactionsRepository implements ITransactionsRepository {
  private readonly logger = new Logger(TransactionsRepository.name);

  private castTransaction = (transaction: Record<string, unknown>): Transaction => transaction as unknown as Transaction;

  async findById(id: string): Promise<Transaction | null> {
    this.logger.debug(`Finding transaction by id: ${id}`);
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);
    return transaction ? this.castTransaction(transaction) : null;
  }

  async findByPaymentId(paymentId: string): Promise<Transaction[]> {
    this.logger.debug(`Finding transactions by payment: ${paymentId}`);
    const results = await db
      .select()
      .from(transactions)
      .where(eq(transactions.paymentId, paymentId))
      .orderBy(desc(transactions.createdAt));
    return results.map(t => this.castTransaction(t));
  }

  async findByUserId(userId: string): Promise<Transaction[]> {
    this.logger.debug(`Finding transactions by user: ${userId}`);
    const results = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));
    return results.map(t => this.castTransaction(t));
  }

  async create(data: CreateTransactionData): Promise<Transaction> {
    this.logger.log(`Creating transaction for user: ${data.userId}`);
    const [transaction] = await db
      .insert(transactions)
      .values(data)
      .returning();
    return this.castTransaction(transaction);
  }
}
