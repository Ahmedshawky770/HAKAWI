import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { payments } from '../../../db/schema/payments.schema.js';
import { db } from '../../../db/index.js';
import type {
  IPaymentsRepository,
  Payment,
  CreatePaymentData,
  UpdatePaymentData,
} from '../interfaces/payments-repository.interface.js';

@Injectable()
export class PaymentsRepository implements IPaymentsRepository {
  private readonly logger = new Logger(PaymentsRepository.name);

  private castPayment = (payment: Record<string, unknown>): Payment => payment as unknown as Payment;

  async findById(id: string): Promise<Payment | null> {
    this.logger.debug(`Finding payment by id: ${id}`);
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);
    return payment ? this.castPayment(payment) : null;
  }

  async findByUserId(userId: string): Promise<Payment[]> {
    this.logger.debug(`Finding payments by user: ${userId}`);
    const results = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));
    return results.map(p => this.castPayment(p));
  }

  async findByTransactionId(transactionId: string): Promise<Payment | null> {
    this.logger.debug(`Finding payment by transaction id: ${transactionId}`);
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.transactionId, transactionId))
      .limit(1);
    return payment ? this.castPayment(payment) : null;
  }

  async findByStatus(status: Payment['status']): Promise<Payment[]> {
    this.logger.debug(`Finding payments by status: ${status}`);
    const results = await db
      .select()
      .from(payments)
      .where(eq(payments.status, status))
      .orderBy(desc(payments.createdAt));
    return results.map(p => this.castPayment(p));
  }

  async create(data: CreatePaymentData): Promise<Payment> {
    this.logger.log(`Creating payment for user: ${data.userId}`);
    const [payment] = await db.insert(payments).values(data).returning();
    return this.castPayment(payment);
  }

  async update(id: string, data: Partial<UpdatePaymentData>): Promise<Payment> {
    this.logger.debug(`Updating payment: ${id}`);
    const [payment] = await db
      .update(payments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return this.castPayment(payment);
  }
}
