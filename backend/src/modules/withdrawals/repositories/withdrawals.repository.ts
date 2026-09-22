import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { withdrawals } from '../../../db/schema/withdrawals.schema.js';
import { db } from '../../../db/index.js';
import type {
  IWithdrawalsRepository,
  Withdrawal,
  CreateWithdrawalData,
  UpdateWithdrawalData,
} from '../interfaces/withdrawals-repository.interface.js';

@Injectable()
export class WithdrawalsRepository implements IWithdrawalsRepository {
  private readonly logger = new Logger(WithdrawalsRepository.name);

  private castWithdrawal = (withdrawal: Record<string, unknown>): Withdrawal => withdrawal as unknown as Withdrawal;

  async findById(id: string): Promise<Withdrawal | null> {
    this.logger.debug(`Finding withdrawal by id: ${id}`);
    const [withdrawal] = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, id))
      .limit(1);
    return withdrawal ? this.castWithdrawal(withdrawal) : null;
  }

  async findByUserId(userId: string): Promise<Withdrawal[]> {
    this.logger.debug(`Finding withdrawals by user: ${userId}`);
    const results = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, userId))
      .orderBy(desc(withdrawals.createdAt));
    return results.map(w => this.castWithdrawal(w));
  }

  async findByStatus(status: Withdrawal['status']): Promise<Withdrawal[]> {
    this.logger.debug(`Finding withdrawals by status: ${status}`);
    const results = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.status, status))
      .orderBy(desc(withdrawals.createdAt));
    return results.map(w => this.castWithdrawal(w));
  }

  async create(data: CreateWithdrawalData): Promise<Withdrawal> {
    this.logger.log(`Creating withdrawal for user: ${data.userId}`);
    const [withdrawal] = await db.insert(withdrawals).values(data).returning();
    return this.castWithdrawal(withdrawal);
  }

  async update(
    id: string,
    data: Partial<UpdateWithdrawalData>,
  ): Promise<Withdrawal> {
    this.logger.debug(`Updating withdrawal: ${id}`);
    const [withdrawal] = await db
      .update(withdrawals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(withdrawals.id, id))
      .returning();
    return this.castWithdrawal(withdrawal);
  }
}
