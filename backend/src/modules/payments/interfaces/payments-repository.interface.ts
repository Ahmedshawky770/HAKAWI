export const PAYMENTS_REPOSITORY = Symbol('PAYMENTS_REPOSITORY');

/**
 * Thrown by {@link IPaymentsRepository.reserveRefundCapacity} when a refund would take the total
 * refunded past the captured amount.
 *
 * A typed error rather than an HTTP exception because the rule belongs to the repository, not to the
 * transport: the same refusal must hold whichever caller reaches it. `PaymentsService` maps it to
 * `BadRequestException`. Every amount is integer minor units.
 */
export class RefundCapacityExceededError extends Error {
  constructor(
    readonly requested: number,
    readonly alreadyRefunded: number,
    readonly capturedAmount: number,
  ) {
    super(
      alreadyRefunded === 0
        ? `Refund amount ${requested} exceeds the captured amount ${capturedAmount}`
        : `Refund amount ${requested} exceeds the remaining refundable amount ${capturedAmount - alreadyRefunded} ` +
            `(${alreadyRefunded} of ${capturedAmount} already refunded)`,
    );
    this.name = 'RefundCapacityExceededError';
  }

  /** Minor units still refundable on this payment. */
  get remaining(): number {
    return this.capturedAmount - this.alreadyRefunded;
  }
}

/** Thrown when a refund is requested for a payment that does not exist or is soft-deleted. */
export class RefundablePaymentNotFoundError extends Error {
  constructor(readonly paymentId: string) {
    super('Payment not found');
    this.name = 'RefundablePaymentNotFoundError';
  }
}

export type Payment = {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  paymobOrderId: string | null;
  paymobPaymentId: string | null;
  paymobTransactionId: string | null;
  paymobPaymentKey: string | null;
  paymobIframeUrl: string | null;
  paymobAcceptUrl: string | null;
  metadata: string | null;
  description: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePaymentInput = {
  userId: string;
  amount: number;
  currency?: string;
  paymentMethod: string;
  description?: string | null;
  metadata?: string | null;
  status?: string;
};

export type PaymentTransaction = {
  id: string;
  paymentId: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  gatewayResponse: string | null;
  createdAt: Date;
};

export type Refund = {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  paymobRefundId: string | null;
  metadata: string | null;
  createdAt: Date;
};

/**
 * The refund statuses that consume refund capacity against a payment.
 *
 * `pending` is included deliberately: capacity is reserved *before* the gateway is called, so a
 * refund sitting in `pending` has money that may already have left the merchant account. Only a
 * `failed` or `cancelled` refund gives the capacity back. Excluding `pending` here would reopen the
 * double-refund window the reservation exists to close.
 */
export const REFUND_CAPACITY_STATUSES: readonly string[] = ['pending', 'processed'];

/** Everything a caller needs to know about a refund that was admitted against a payment. */
export type RefundReservation = {
  /** The payment row as it was read under the row lock, before the reservation. */
  readonly payment: Payment;
  /** The refund row inserted by this reservation, in `pending`. */
  readonly refund: Refund;
  /** Minor units already reserved by earlier refunds that are still non-terminal. */
  readonly alreadyRefunded: number;
  /** `alreadyRefunded` plus the amount just reserved. */
  readonly reservedTotal: number;
  /** True when the reservation brought the reserved total up to the captured amount. */
  readonly paymentFullyRefunded: boolean;
};

/** Outcome of re-deriving a payment's status from the refunds that still hold capacity. */
export type RefundCapacityReconciliation = {
  readonly payment: Payment;
  readonly reservedTotal: number;
  /** True when the payment ended the reconciliation as `refunded`. */
  readonly paymentFullyRefunded: boolean;
};

export interface IPaymentsRepository {
  findById(id: string): Promise<Payment | null>;
  findByOrderId(orderId: string): Promise<Payment | null>;
  findByTransactionId(transactionId: string): Promise<Payment | null>;
  findAll(params: {
    userId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ payments: Payment[]; total: number }>;
  create(data: CreatePaymentInput): Promise<Payment>;
  update(id: string, data: Partial<Payment>): Promise<Payment>;
  softDelete(id: string): Promise<void>;
  createTransaction(data: {
    paymentId: string;
    type: string;
    status: string;
    amount: number;
    currency: string;
    gatewayResponse?: string | null;
  }): Promise<PaymentTransaction>;
  createRefund(data: {
    paymentId: string;
    amount: number;
    currency: string;
    reason?: string | null;
    status?: string;
    paymobRefundId?: string | null;
    metadata?: string | null;
  }): Promise<Refund>;
  updateRefund(id: string, data: Partial<Refund>): Promise<Refund>;
  findRefundsByPayment(paymentId: string): Promise<Refund[]>;
  /**
   * Admits a refund against a payment, or refuses it because the payment's refund capacity is
   * already committed.
   *
   * Reading the payment, summing the existing refunds and inserting the new one happen inside one
   * transaction that holds a `SELECT ... FOR UPDATE` lock on the payment row, so two concurrent
   * refunds cannot both read the same pre-refund total and both conclude there is room. The sum is
   * integer minor units throughout; no float ever touches money.
   *
   * Throws `RefundCapacityExceededError` when the reservation would take the total past the
   * captured amount. Throws `RefundablePaymentNotFoundError` when the payment does not exist or is
   * soft-deleted.
   */
  reserveRefundCapacity(input: {
    paymentId: string;
    amountCents: number;
    currency: string;
    reason?: string | null;
  }): Promise<RefundReservation>;
  /**
   * Re-derives a payment's status from the refunds that still hold capacity, under the same row
   * lock.
   *
   * A reservation that reaches the cap flips the payment to `refunded` atomically with the insert.
   * If that refund then fails at the gateway the capacity is released again, and this is what puts
   * the payment back to `completed`. It is a correction of derived state, not a user-requested
   * transition, so it deliberately does not go through `PAYMENT_TRANSITIONS`.
   */
  reconcileRefundCapacity(paymentId: string): Promise<RefundCapacityReconciliation>;
}
