import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, count, isNull, inArray, sql } from 'drizzle-orm';

import {
  IPaymentsRepository,
  Payment,
  CreatePaymentInput,
  PaymentTransaction,
  Refund,
  RefundCapacityReconciliation,
  RefundReservation,
  REFUND_CAPACITY_STATUSES,
  RefundCapacityExceededError,
  RefundablePaymentNotFoundError,
} from '../interfaces/payments-repository.interface.ts';
import {
  payments,
  paymentTransactions,
  refunds,
  NewPaymentTransaction,
  NewRefund,
} from '../../../db/schema/payments.schema.ts';
import { db } from '../../../db/index.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';

/**
 * The transaction handle Drizzle hands to a `db.transaction` callback, taken from the driver that
 * owns the connection pool rather than re-declared here. Naming it once means every helper that
 * needs the same connection — the row lock, the sum, the writes — is visibly on one connection.
 */
type PaymentsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// drizzle-ORM db and sql template tags are typed as `any` by the library.
// Accepted external-library typing limitation — no production code change.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

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

  async findByTransactionId(transactionId: string): Promise<Payment | null> {
    this.logger.debug(`Finding payment by transaction id: ${transactionId}`);
    const [payment] = await db.select().from(payments).where(eq(payments.paymobTransactionId, transactionId)).limit(1);
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

    const conditions = [isNull(payments.deletedAt)];

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
    const [payment] = await db
      .update(payments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
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

  async updateRefund(id: string, data: Partial<Refund>): Promise<Refund> {
    this.logger.debug(`Updating refund: ${id}`);
    const [refund] = await db.update(refunds).set(data).where(eq(refunds.id, id)).returning();
    return refund;
  }

  async findRefundsByPayment(paymentId: string): Promise<Refund[]> {
    this.logger.debug(`Finding refunds for payment: ${paymentId}`);
    return db.select().from(refunds).where(eq(refunds.paymentId, paymentId));
  }

  async reserveRefundCapacity(input: {
    paymentId: string;
    amountCents: number;
    currency: string;
    reason?: string | null;
  }): Promise<RefundReservation> {
    this.logger.info(`Reserving ${input.amountCents} for refund on payment: ${input.paymentId}`);

    return db.transaction(async (tx) => {
      // WHY the lock: the capacity check is a read (sum the live refunds) followed by a write
      // (insert another refund). Without `FOR UPDATE` two concurrent refunds both read the same
      // pre-refund total, both conclude there is room, and both are committed — which is how a
      // single capture gets refunded twice. Serialising on the payment row makes the read-then-write
      // pair atomic against every other refund of the same payment.
      const payment = await this.lockPayment(tx, input.paymentId);
      if (payment === null || payment.deletedAt) {
        throw new RefundablePaymentNotFoundError(input.paymentId);
      }

      const alreadyRefunded = await this.sumReservedRefunds(tx, input.paymentId);
      const reservedTotal = alreadyRefunded + input.amountCents;

      if (reservedTotal > payment.amount) {
        // Throwing inside the transaction rolls it back, so a refused refund leaves no trace.
        this.logger.warn(
          `Refusing refund of ${input.amountCents} on payment ${input.paymentId}: ${alreadyRefunded} of ${payment.amount} already reserved`,
        );
        throw new RefundCapacityExceededError(input.amountCents, alreadyRefunded, payment.amount);
      }

      const paymentFullyRefunded = reservedTotal === payment.amount;

      const [refund] = await tx
        .insert(refunds)
        .values({
          paymentId: input.paymentId,
          amount: input.amountCents,
          currency: input.currency,
          reason: input.reason ?? null,
          status: 'pending',
          paymobRefundId: null,
          metadata: null,
        } satisfies NewRefund)
        .returning();

      if (paymentFullyRefunded && payment.status !== 'refunded') {
        // Flipped in the same transaction as the insert that reached the cap, so a crash between
        // the two can never leave a fully-refunded payment still reading `completed`.
        await this.setStatus(tx, input.paymentId, 'refunded');
      }

      return { payment, refund, alreadyRefunded, reservedTotal, paymentFullyRefunded };
    });
  }

  async reconcileRefundCapacity(paymentId: string): Promise<RefundCapacityReconciliation> {
    this.logger.debug(`Reconciling refund capacity for payment: ${paymentId}`);

    return db.transaction(async (tx) => {
      const payment = await this.lockPayment(tx, paymentId);
      if (payment === null || payment.deletedAt) {
        throw new RefundablePaymentNotFoundError(paymentId);
      }

      const reservedTotal = await this.sumReservedRefunds(tx, paymentId);
      const paymentFullyRefunded = reservedTotal >= payment.amount;

      // Only the two states the reservation itself can leave behind are corrected. A payment that
      // is `failed`, `cancelled` or `pending` was never fully refunded and is left alone.
      const corrected = await this.repairDerivedStatus(tx, payment, reservedTotal, paymentFullyRefunded);

      return { payment: corrected, reservedTotal, paymentFullyRefunded };
    });
  }

  /**
   * Sums the refunds that still hold capacity against a payment.
   *
   * `sum(integer)` returns `bigint` in Postgres and the driver hands bigints back as strings, so
   * the result is typed `string` and converted here. A non-integral or unsafe total is refused
   * rather than silently truncated: this number gates money, so an unreadable value must not become
   * a plausible-looking capacity.
   */
  private async sumReservedRefunds(tx: PaymentsTransaction, paymentId: string): Promise<number> {
    const [row] = await tx
      .select({ reservedTotal: sql<string>`coalesce(sum(${refunds.amount}), 0)` })
      .from(refunds)
      .where(and(eq(refunds.paymentId, paymentId), inArray(refunds.status, [...REFUND_CAPACITY_STATUSES])));

    const total = Number(row?.reservedTotal ?? '0');
    if (!Number.isSafeInteger(total) || total < 0) {
      this.logger.error(
        `Refund capacity for payment ${paymentId} is unreadable: received ${String(row?.reservedTotal)}`,
      );
      throw new Error(`Refund capacity for payment ${paymentId} is not a usable integer amount`);
    }
    return total;
  }

  /** Reads one payment and holds a row lock on it for the rest of the transaction. */
  private async lockPayment(tx: PaymentsTransaction, paymentId: string): Promise<Payment | null> {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1).for('update');
    return payment ?? null;
  }

  private async setStatus(tx: PaymentsTransaction, paymentId: string, status: string): Promise<void> {
    await tx.update(payments).set({ status, updatedAt: new Date() }).where(eq(payments.id, paymentId));
  }

  private async repairDerivedStatus(
    tx: PaymentsTransaction,
    payment: Payment,
    reservedTotal: number,
    paymentFullyRefunded: boolean,
  ): Promise<Payment> {
    const shouldBeRefunded = paymentFullyRefunded && payment.status === 'completed';
    const shouldBeCompleted = !paymentFullyRefunded && payment.status === 'refunded';

    if (!shouldBeRefunded && !shouldBeCompleted) {
      return payment;
    }

    const nextStatus = shouldBeRefunded ? 'refunded' : 'completed';
    const [updated] = await tx
      .update(payments)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(payments.id, payment.id))
      .returning();

    this.logger.info(
      `Payment ${payment.id} refund capacity changed to ${reservedTotal} of ${payment.amount}: status ${payment.status} -> ${nextStatus}`,
    );

    return updated ?? { ...payment, status: nextStatus };
  }
}
