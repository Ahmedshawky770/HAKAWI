import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { refunds } from '../../../db/schema/refunds.schema.js';
import { db } from '../../../db/index.js';
import type {
  IRefundsRepository,
  Refund,
  CreateRefundData,
} from '../interfaces/refunds-repository.interface.js';

@Injectable()
export class RefundsRepository implements IRefundsRepository {
  private readonly logger = new Logger(RefundsRepository.name);

  async findById(id: string): Promise<Refund | null> {
    this.logger.debug(`Finding refund by id: ${id}`);
    const [refund] = await db
      .select()
      .from(refunds)
      .where(eq(refunds.id, id))
      .limit(1);
    return refund ?? null;
  }

  async findByPaymentId(paymentId: string): Promise<Refund | null> {
    this.logger.debug(`Finding refund by payment id: ${paymentId}`);
    const [refund] = await db
      .select()
      .from(refunds)
      .where(eq(refunds.paymentId, paymentId))
      .limit(1);
    return refund ?? null;
  }

  async findByRefundedBy(refundedBy: string): Promise<Refund[]> {
    this.logger.debug(`Finding refunds by user: ${refundedBy}`);
    return db
      .select()
      .from(refunds)
      .where(eq(refunds.refundedBy, refundedBy))
      .orderBy(desc(refunds.createdAt));
  }

  async create(data: CreateRefundData): Promise<Refund> {
    this.logger.log(`Creating refund for payment: ${data.paymentId}`);
    const [refund] = await db.insert(refunds).values(data).returning();
    return refund;
  }
}
