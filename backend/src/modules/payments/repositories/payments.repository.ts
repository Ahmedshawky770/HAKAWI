import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, count, sql } from 'drizzle-orm';

import { IPaymentsRepository, Payment, CreatePaymentInput, PaymentTransaction, Refund } from '../interfaces/payments-repository.interface.ts';
import { PAYMENTS_REPOSITORY } from '../interfaces/payments-repository.interface.ts';
import { payments, paymentTransactions, refunds, NewPaymentTransaction, NewRefund } from '../../../db/schema/payments.schema.ts';
import { db } from '../../../db/index.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

@Injectable()
export class PaymentsRepository implements IPaymentsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Payment | null> {
    this.logger.debug(`Finding payment by id: ${id}`);
    try {
      const [payment] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
      return payment ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    this.logger.debug(`Finding payment by order id: ${orderId}`);
    const [payment] = await db.select().from(payments).where(eq(payments.paymobOrderId, orderId)).limit(1);
    return payment ?? null;
  }

  async findAll(params: {
    userId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ payments: Payment[]; total: number }> {
    this.logger.debug('Finding all payments');
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(payments.deletedAt, null as unknown as Date)];

    if (params.userId) {
      conditions.push(eq(payments.userId, params.userId));
    }
    if (params.status) {
      conditions.push(eq(payments.status, params.status));
    }

    const whereClause = and(...conditions);

    const [paymentsResult, [{ total }]] = await Promise.all([
      db.select().from(payments).where(whereClause).orderBy(desc(payments.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(payments).where(whereClause),
    ]);

    return { payments: paymentsResult, total: Number(total) };
  }

  async create(data: CreatePaymentInput): Promise<Payment> {
    this.logger.info(`Creating payment for user: ${data.userId}, amount: ${data.amount}`);
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }

  async update(id: string, data: Partial<Payment>): Promise<Payment> {
    this.logger.debug(`Updating payment: ${id}`);
    const [payment] = await db.update(payments).set({ ...data, updatedAt: new Date() }).where(eq(payments.id, id)).returning();
    return payment;
  }

  async softDelete(id: string): Promise<void> {
    this.logger.info(`Soft deleting payment: ${id}`);
    await db.update(payments).set({ deletedAt: new Date() }).where(eq(payments.id, id));
  }

  async createTransaction(data: {
    paymentId: string;
    type: string;
    status: string;
    amount: number;
    currency: string;
    gatewayResponse?: string | null;
  }): Promise<PaymentTransaction> {
    this.logger.info(`Creating transaction for payment: ${data.paymentId}`);
    const values: NewPaymentTransaction = {
      paymentId: data.paymentId,
      type: data.type,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      gatewayResponse: data.gatewayResponse ?? null,
    };
    const [transaction] = await db.insert(paymentTransactions).values(values).returning();
    return transaction;
  }

  async createRefund(data: {
    paymentId: string;
    amount: number;
    currency: string;
    reason?: string | null;
    status?: string;
    paymobRefundId?: string | null;
    metadata?: string | null;
  }): Promise<Refund> {
    this.logger.info(`Creating refund for payment: ${data.paymentId}`);
    const values: NewRefund = {
      paymentId: data.paymentId,
      amount: data.amount,
      currency: data.currency,
      reason: data.reason ?? null,
      status: data.status ?? 'pending',
      paymobRefundId: data.paymobRefundId ?? null,
      metadata: data.metadata ?? null,
    };
    const [refund] = await db.insert(refunds).values(values).returning();
    return refund;
  }

  async findRefundsByPayment(paymentId: string): Promise<Refund[]> {
    this.logger.debug(`Finding refunds for payment: ${paymentId}`);
    return db.select().from(refunds).where(eq(refunds.paymentId, paymentId));
  }
}
