import * as crypto from 'crypto';

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import { reviveNullableDate, reviveRequiredDate } from '../shared/cache/date-revival.ts';
import { PAYMOB_CONFIG, type PaymobConfig } from '../../config/paymob.config.ts';
import type {
  PaymentCreatedEvent,
  PaymentCompletedEvent,
  PaymentFailedEvent,
  RefundCreatedEvent,
} from '../../common/events/payments.events.ts';

import { PAYMOB_CLIENT, PaymobGatewayError } from './clients/paymob.client.ts';
import type { PaymobGateway } from './clients/paymob.client.ts';
import {
  paymobAmountCentsSchema,
  paymobCurrencySchema,
  paymobWebhookPayloadSchema,
  resolveWebhookAmountCents,
  resolveWebhookOrderId,
  resolveWebhookStatus,
  resolveWebhookTransactionId,
} from './clients/paymob.schemas.ts';
import type { PaymobWebhookPayload } from './clients/paymob.schemas.ts';
import type {
  IPaymentsRepository,
  Payment,
  CreatePaymentInput,
  PaymentTransaction,
  Refund,
} from './interfaces/payments-repository.interface.ts';
import {
  PAYMENTS_REPOSITORY,
  RefundCapacityExceededError,
  RefundablePaymentNotFoundError,
} from './interfaces/payments-repository.interface.ts';
import type { PaymentResponse, PaymentsListResponse, PaymobCheckoutResponse, RefundResponse } from './types.ts';

export type CreatePaymentOptions = {
  readonly initializeGateway?: boolean;
};

type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';

export const PAYMENT_CACHE_NAMESPACE = 'payment';
export const PAYMENTS_CACHE_TAG = 'payments';
export const PAYMENT_CACHE_TTL_SECONDS = 300;

/**
 * The single source of truth for legal user-requested status changes (Principle #9).
 *
 * The one transition that is absent on purpose is `refunded -> completed`. It happens in the real
 * world when a reservation that reached the cap is later released because the gateway rejected the
 * refund, and `PaymentsRepository.reconcileRefundCapacity` performs it. That is a correction of
 * derived state under a row lock, not an operator decision, so it deliberately does not run through
 * this table — which otherwise would let `PATCH /payments/:id/status` un-refund a payment by hand.
 */
const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['processing', 'completed', 'failed', 'cancelled'],
  processing: ['completed', 'failed'],
  completed: ['refunded'],
  failed: [],
  cancelled: [],
  refunded: [],
};

/**
 * Restores the shape the repository returns after a `JSON.parse` of a cached payment.
 *
 * `TaggedCacheService` persists with `JSON.stringify`, so `createdAt`/`updatedAt` come back as ISO
 * strings on a cache hit while a miss returns real `Date` objects — two different runtime shapes
 * behind one `Promise<Payment>` signature. Anything that then calls `.toISOString()`, `.getTime()`
 * or compares the field against a `Date` behaves differently depending on cache state, which is the
 * same defect class that made the books endpoints fail only on warm keys.
 *
 * `reviveRequiredDate` raises `CacheEntryCorruptError` for a missing or unparseable timestamp and
 * the cache treats that as a miss and reloads, so a corrupt entry heals instead of 500-ing.
 */
function revivePaymentDates(payment: Payment): Payment {
  return {
    ...payment,
    deletedAt: reviveNullableDate(payment.deletedAt, 'deletedAt'),
    createdAt: reviveRequiredDate(payment.createdAt, 'createdAt'),
    updatedAt: reviveRequiredDate(payment.updatedAt, 'updatedAt'),
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENTS_REPOSITORY) private readonly paymentsRepository: IPaymentsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(TaggedCacheService) private readonly cache: TaggedCacheService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    @Inject(PAYMOB_CLIENT) private readonly paymob: PaymobGateway,
    @Inject(PAYMOB_CONFIG) private readonly config: PaymobConfig,
  ) {}

  private async invalidatePaymentCache(id: string): Promise<void> {
    await this.cache.invalidateKey(PAYMENT_CACHE_NAMESPACE, id);
    await this.cache.invalidateTags([PAYMENTS_CACHE_TAG]);
  }

  validateStatusTransition(currentStatus: PaymentStatus, newStatus: PaymentStatus): void {
    const allowed = PAYMENT_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Invalid payment status transition from ${currentStatus} to ${newStatus}`);
    }
  }

  /**
   * Verifies an HMAC-SHA256 signature over the raw request body.
   *
   * The comparison is `crypto.timingSafeEqual`, not `!==`. `!==` over two hex strings returns as soon
   * as it finds a differing byte, so the time it takes leaks how many leading bytes of a forged
   * signature were correct — a byte-at-a-time oracle for anyone allowed to POST to the endpoint.
   *
   * WHY the extra hash: `timingSafeEqual` throws when the two buffers differ in length, and a
   * signature of the wrong length is the common case for an attacker rather than an accident.
   * Comparing the SHA-256 fingerprints of the two buffers keeps every rejection on one path of
   * constant length, so the response cannot distinguish "wrong length" from "wrong content" — not in
   * the status code and not in the time it took to produce it. `Buffer.from(value, 'hex')` silently
   * stops at the first invalid pair rather than throwing, so a malformed signature arrives here as a
   * short buffer and is rejected by the same comparison.
   */
  validateWebhookSignature(rawBody: string, signature: string | undefined, secret: string | undefined): void {
    if (!secret) {
      throw new BadRequestException('Webhook secret is not configured');
    }

    if (!signature) {
      throw new BadRequestException('Missing webhook signature');
    }

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
    const provided = Buffer.from(signature, 'hex');
    const expectedFingerprint = crypto.createHash('sha256').update(expected).digest();
    const providedFingerprint = crypto.createHash('sha256').update(provided).digest();

    if (!crypto.timingSafeEqual(expectedFingerprint, providedFingerprint)) {
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  async createPayment(input: CreatePaymentInput, options: CreatePaymentOptions = {}): Promise<Payment> {
    this.logger.info(`Creating payment for user: ${input.userId}, amount: ${input.amount}`);

    const currency = this.validateCurrency(input.currency ?? 'EGP');
    const amount = this.validateAmount(input.amount);

    const data: CreatePaymentInput = {
      ...input,
      amount,
      currency,
      status: 'pending',
      metadata: input.metadata ?? null,
    };

    const payment = await this.paymentsRepository.create(data);
    await this.eventBus.emit('payment.created', { paymentId: payment.id, userId: input.userId } as PaymentCreatedEvent);

    if (options.initializeGateway !== true) {
      return payment;
    }
    if (input.paymentMethod !== 'paymob') {
      throw new BadRequestException(
        `initializeGateway is only supported for the paymob payment method, received "${input.paymentMethod}"`,
      );
    }

    const initialized = await this.registerPaymobCheckout(payment, amount, currency);
    return initialized.payment;
  }

  async findById(id: string): Promise<Payment> {
    const { value } = await this.cache.getOrSet<Payment>({
      namespace: PAYMENT_CACHE_NAMESPACE,
      key: id,
      ttl: PAYMENT_CACHE_TTL_SECONDS,
      tags: [PAYMENTS_CACHE_TAG],
      // Without this the cached path returns a different runtime shape than the uncached one: dates
      // arrive as ISO strings on a hit and as `Date` objects on a miss.
      revive: revivePaymentDates,
      load: async () => {
        const payment = await this.paymentsRepository.findById(id);
        if (!payment || payment.deletedAt) {
          throw new NotFoundException('Payment not found');
        }
        return payment;
      },
    });
    return value;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    return this.paymentsRepository.findByOrderId(orderId);
  }

  async findAll(params: {
    userId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaymentsListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const result = await this.paymentsRepository.findAll(params);
    const payments = result.payments.map((payment) => this.toPaymentResponse(payment));

    return {
      payments,
      total: result.total,
      page,
      limit,
    };
  }

  async updateStatus(id: string, status: string): Promise<Payment> {
    const existing = await this.paymentsRepository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Payment not found');
    }

    this.validateStatusTransition(existing.status as PaymentStatus, status as PaymentStatus);

    const payment = await this.paymentsRepository.update(id, { status });
    await this.invalidatePaymentCache(id);

    if (status === 'completed') {
      await this.eventBus.emit('payment.completed', { paymentId: id } as PaymentCompletedEvent);
    } else if (status === 'failed') {
      await this.eventBus.emit('payment.failed', { paymentId: id } as PaymentFailedEvent);
    }

    return payment;
  }

  async createTransaction(
    paymentId: string,
    type: string,
    status: string,
    amount: number,
    gatewayResponse?: Record<string, unknown> | null,
  ): Promise<PaymentTransaction> {
    const payment = await this.paymentsRepository.findById(paymentId);
    if (!payment || payment.deletedAt) {
      throw new NotFoundException('Payment not found');
    }

    return this.paymentsRepository.createTransaction({
      paymentId,
      type,
      status,
      amount,
      currency: payment.currency,
      gatewayResponse: gatewayResponse ? JSON.stringify(gatewayResponse) : null,
    });
  }

  async createRefund(paymentId: string, amount: number, reason?: string): Promise<Refund> {
    const requestedAmount = this.validateAmount(amount);

    const payment = await this.paymentsRepository.findById(paymentId);
    if (!payment || payment.deletedAt) {
      throw new NotFoundException('Payment not found');
    }

    // The currency is read from the payment row, which is a stored value and therefore not trusted to
    // be a string. `validateCurrency` rejects null and blank with a 400 rather than letting
    // `.toUpperCase()` throw a TypeError that would surface as an untyped 500.
    const currency = this.validateCurrency(payment.currency);

    let reservation;
    try {
      // The capacity check, the insert and the status flip all happen under one row lock inside one
      // transaction. A prior version compared only the *requested* amount against the *original*
      // charge and never summed what had already been refunded, so a 100-unit payment that had been
      // fully refunded stayed `completed` and accepted a second 100-unit refund.
      reservation = await this.paymentsRepository.reserveRefundCapacity({
        paymentId,
        amountCents: requestedAmount,
        currency,
        reason: reason ?? null,
      });
    } catch (error) {
      throw this.toRefundAdmissionError(error);
    }

    // The row read above is only a fast path; the locked read inside the transaction is the one that
    // decides. If the two disagree, the locked read wins and the reservation just made is undone so
    // it cannot go on holding refund capacity.
    const lockedPayment = reservation.payment;
    if (lockedPayment.status !== 'completed') {
      await this.markRefundFailed(reservation.refund, { error: 'payment is not refundable' });
      await this.releaseRefundCapacity(paymentId, 'the locked payment is not refundable');
      throw new BadRequestException('Cannot refund a payment that is not completed');
    }

    await this.eventBus.emit('refund.created', {
      paymentId,
      refundId: reservation.refund.id,
    } as RefundCreatedEvent);

    await this.invalidatePaymentCache(paymentId);

    return this.submitRefundToGateway(lockedPayment, reservation.refund);
  }

  /**
   * Gives back the refund capacity a released reservation was holding, so the payment's derived
   * status follows whatever the remaining live refunds actually add up to.
   *
   * The refund row itself is written by {@link markRefundFailed} *before* this is called, so the
   * gateway's own error text is what stays in `metadata` — doing the write here as well would
   * overwrite the only diagnostic that says why the upstream call failed.
   *
   * Failures are logged and swallowed on purpose: the caller is already raising the real HTTP error,
   * and turning a bookkeeping failure into that error would hide the more important cause. The
   * payment is left `refunded` in that case, which is safe — over-restricting refunds cannot cost a
   * customer money, whereas an over-release could.
   */
  private async releaseRefundCapacity(paymentId: string, reason: string): Promise<void> {
    this.logger.warn(`Releasing refund capacity on payment ${paymentId}: ${reason}`);
    try {
      await this.paymentsRepository.reconcileRefundCapacity(paymentId);
      await this.invalidatePaymentCache(paymentId);
    } catch (error) {
      this.logger.error(
        `Failed to release refund capacity on payment ${paymentId}: ${this.describeGatewayError(error)}`,
      );
    }
  }

  /**
   * Turns a refusal from the reservation into the HTTP status the caller actually deserves.
   *
   * The transaction is the point: while it was open nothing else could see the extra reservation, so
   * rolling it back leaves the payment exactly as it was. What the caller gets is a plain rejection,
   * never a partially-refunded payment.
   */
  private toRefundAdmissionError(error: unknown): Error {
    if (error instanceof RefundCapacityExceededError) {
      return new BadRequestException(error.message);
    }
    if (error instanceof RefundablePaymentNotFoundError) {
      return new NotFoundException('Payment not found');
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Sends a reserved refund to the gateway and records the outcome.
   *
   * Every exit from here either succeeds or raises a typed `HttpException`. The previous version
   * swallowed the failure and returned a `failed` refund row, which `POST /payments/:id/refund`
   * then reported as `201 Created` — a failed upstream call announced as a created resource, with
   * nothing emitted for the DLQ or the ledger to see.
   */
  private async submitRefundToGateway(payment: Payment, refund: Refund): Promise<Refund> {
    if (payment.paymobTransactionId === null || payment.paymobTransactionId.length === 0) {
      const detail =
        'the webhook never delivered a Paymob transaction_id for this payment, so there is nothing to refund upstream';
      this.logger.error(`Refund ${refund.id} cannot be submitted: payment ${payment.id} has no Paymob transaction id`);

      await this.markRefundFailed(refund, { error: 'missing_paymob_transaction_id', detail });
      await this.releaseRefundCapacity(payment.id, 'the payment has no Paymob transaction id');
      // 400 rather than 503: retrying cannot help, because the missing value is produced by our own
      // payment record and no retry of this request will make it appear.
      throw new BadRequestException(
        `The payment cannot be refunded because it has no Paymob transaction id: ${detail}`,
      );
    }

    let result: Awaited<ReturnType<PaymobGateway['refundTransaction']>>;
    try {
      result = await this.paymob.refundTransaction({
        transactionId: payment.paymobTransactionId,
        amountCents: refund.amount,
      });
    } catch (error) {
      const detail = this.describeGatewayError(error);
      this.logger.error(`Paymob refund submission failed for refund ${refund.id}: ${detail}`);

      await this.markRefundFailed(refund, { error: detail });
      await this.releaseRefundCapacity(payment.id, 'the gateway call failed');
      // 503: the gateway, not the request, is what failed, and the same call may well succeed later.
      throw new ServiceUnavailableException(
        `The payment gateway refused the refund, so it was not submitted: ${detail}`,
      );
    }

    if (!result.pending && !result.success) {
      // A 2xx from the gateway that reports `success: false` is a refusal, not a settlement. Writing
      // it as `processed` would claim money was returned when it was not.
      this.logger.error(
        `Paymob reported the refund ${refund.id} (paymobRefundId=${result.refundId}) as unsuccessful: ${JSON.stringify(result.raw)}`,
      );

      await this.markRefundFailed(refund, { error: 'gateway reported the refund as unsuccessful', paymob: result.raw });
      await this.releaseRefundCapacity(payment.id, 'the gateway reported the refund as unsuccessful');
      throw new ServiceUnavailableException(
        `The payment gateway accepted the refund request but reported it as unsuccessful (paymobRefundId=${result.refundId})`,
      );
    }

    const submitted = await this.paymentsRepository.updateRefund(refund.id, {
      status: result.pending ? 'pending' : 'processed',
      paymobRefundId: result.refundId,
      metadata: JSON.stringify({
        paymob: result.raw,
        success: result.success,
        isRefund: result.isRefund,
      }),
    });

    if (result.pending) {
      // Still pending upstream, so the capacity stays reserved and the payment keeps whatever status
      // the reservation gave it. The refund row is the thing an operator reconciles later.
      this.logger.info(`Paymob refund ${refund.id} is still pending upstream (paymobRefundId=${result.refundId})`);
    }

    return submitted;
  }

  /** Records the failed outcome and emits `refund.failed` so the DLQ and the ledger see it. */
  private async markRefundFailed(refund: Refund, errorDetail: Record<string, unknown>): Promise<void> {
    await this.paymentsRepository.updateRefund(refund.id, {
      status: 'failed',
      metadata: JSON.stringify(errorDetail),
    });
    // Registry note: `refund.failed` is emitted with the contract-conformant `{ paymentId, refundId }`
    // shape. If the shared event registry has no schema registered under that name the emitter routes
    // it to the DLQ instead of throwing, so the failure is recorded rather than lost.
    await this.eventBus.emit('refund.failed', {
      paymentId: refund.paymentId,
      refundId: refund.id,
    } as RefundCreatedEvent);
  }

  async paymobInitializePayment(
    userId: string,
    amount: number,
    currency: string,
    metadata?: Record<string, unknown>,
  ): Promise<PaymobCheckoutResponse> {
    this.logger.info(`Initializing Paymob payment for user: ${userId}, amount: ${amount}`);

    const payment = await this.createPayment({
      userId,
      amount,
      currency,
      paymentMethod: 'paymob',
      description: typeof metadata?.description === 'string' ? metadata.description : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    const validatedCurrency = this.validateCurrency(payment.currency);
    const initialized = await this.registerPaymobCheckout(payment, payment.amount, validatedCurrency);
    return initialized.checkout;
  }

  private async registerPaymobCheckout(
    payment: Payment,
    amountCents: number,
    currency: string,
  ): Promise<{ readonly payment: Payment; readonly checkout: PaymobCheckoutResponse }> {
    let checkout: Awaited<ReturnType<PaymobGateway['createCheckout']>>;
    try {
      checkout = await this.paymob.createCheckout({
        amountCents,
        currency,
        merchantOrderId: payment.id,
      });
    } catch (error) {
      await this.failPaymentAfterGatewayError(payment.id, 'checkout', error);
      throw new ServiceUnavailableException(
        `The payment gateway is unavailable, so no checkout URL was created: ${this.describeGatewayError(error)}`,
      );
    }

    const updated = await this.paymentsRepository.update(payment.id, {
      paymobOrderId: checkout.orderId,
      paymobPaymentKey: checkout.paymentKey,
      paymobIframeUrl: checkout.iframeUrl,
      paymobAcceptUrl: checkout.acceptUrl,
      status: 'processing',
    });
    await this.invalidatePaymentCache(payment.id);

    this.logger.info(
      `Paymob checkout created: orderId=${checkout.orderId}, paymentKey issued for payment ${payment.id}`,
    );

    return {
      payment: updated,
      checkout: {
        paymentId: payment.id,
        orderId: checkout.orderId,
        paymentKey: checkout.paymentKey,
        iframeUrl: checkout.iframeUrl,
        acceptUrl: checkout.acceptUrl,
        status: updated.status,
      },
    };
  }

  private async failPaymentAfterGatewayError(paymentId: string, step: string, error: unknown): Promise<void> {
    this.logger.error(`Paymob ${step} failed for payment ${paymentId}: ${this.describeGatewayError(error)}`);
    await this.paymentsRepository.update(paymentId, { status: 'failed' });
    await this.invalidatePaymentCache(paymentId);

    // `payment.created` was emitted for this payment before the gateway was ever called. Without a
    // matching failure a consumer sees a payment that was created and then nothing at all — the
    // worst possible half-story for an audit trail, and there is no periodic reconciliation to
    // repair it. `failureStage` names which call failed ('checkout' today); the registered
    // `payment.failed` schema declares only `paymentId`, so the extra field rides along unvalidated
    // rather than being dropped from what listeners receive.
    await this.eventBus.emit('payment.failed', {
      paymentId,
      failureStage: step,
    } as PaymentFailedEvent & { readonly failureStage: string });
  }

  private describeGatewayError(error: unknown): string {
    if (error instanceof PaymobGatewayError) {
      return error.message;
    }
    return error instanceof Error ? error.message : String(error);
  }

  private validateAmount(amount: number): number {
    const parsed = paymobAmountCentsSchema.safeParse(amount);
    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid payment amount: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    return parsed.data;
  }

  /**
   * Normalises and validates a currency code.
   *
   * The parameter accepts `null` on purpose. The value usually comes straight out of a `payments`
   * row, and the column is `varchar(3)` with a default — a legacy row written before that default
   * existed can hold `NULL`. Calling `.toUpperCase()` on it raised `TypeError: Cannot read
   * properties of null`, which Nest turns into an untyped 500 for something that is really bad input.
   * A null or blank code is now a 400 with a message that says which field is wrong.
   */
  private validateCurrency(currency: string | null | undefined): string {
    if (typeof currency !== 'string' || currency.trim().length === 0) {
      throw new BadRequestException('Invalid payment currency: a three letter ISO 4217 code is required');
    }

    const parsed = paymobCurrencySchema.safeParse(currency.trim().toUpperCase());
    if (!parsed.success) {
      throw new BadRequestException(
        `Invalid payment currency: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    return parsed.data;
  }

  async getRefunds(paymentId: string): Promise<RefundResponse[]> {
    const refunds = await this.paymentsRepository.findRefundsByPayment(paymentId);
    return refunds.map((refund) => this.toRefundResponse(refund));
  }

  /**
   * Handles one Paymob delivery.
   *
   * Three things are checked before a payment can be marked captured: the signature over the raw
   * body, that the transaction and order names a payment we actually registered, and that the amount
   * Paymob says it captured equals the amount we asked for. The third check is the one that closes the
   * over-collection gap — checkout now creates a real Paymob order for a real amount, so without it
   * a delivery announcing a different amount would be accepted and the local payment marked completed
   * at the wrong value.
   */
  async handlePaymobWebhook(rawBody: string, signature?: string): Promise<{ status: string }> {
    this.validateWebhookSignature(rawBody, signature, this.config.webhookSecret);

    let decoded: unknown;
    try {
      decoded = JSON.parse(rawBody) as unknown;
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }

    const parsed = paymobWebhookPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      this.logger.error(
        `Paymob webhook payload did not match the expected shape: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ')}`,
      );
      throw new BadRequestException('Invalid webhook payload');
    }
    const payload: PaymobWebhookPayload = parsed.data;

    const transactionId = resolveWebhookTransactionId(payload);
    if (!transactionId) {
      throw new BadRequestException('Missing transaction_id in webhook payload');
    }

    const orderId = resolveWebhookOrderId(payload);
    if (!orderId) {
      throw new BadRequestException('Missing order_id in webhook payload');
    }

    const existing = await this.paymentsRepository.findByTransactionId(transactionId);
    if (existing?.status === 'completed') {
      return { status: 'already_processed' };
    }

    const payment = existing ?? (await this.paymentsRepository.findByOrderId(orderId));
    if (!payment) {
      throw new NotFoundException('Payment not found for webhook');
    }

    const status = resolveWebhookStatus(payload);
    const capturedAmountCents = resolveWebhookAmountCents(payload);

    if (status === 'completed') {
      this.assertCapturedAmountMatches(payment, capturedAmountCents, transactionId, orderId);
    }

    this.validateStatusTransition(payment.status as PaymentStatus, status as PaymentStatus);

    await this.paymentsRepository.update(payment.id, {
      status,
      paymobPaymentId: (payload.payment_id as string | null) ?? payment.paymobPaymentId,
      paymobTransactionId: transactionId,
      metadata: JSON.stringify(decoded),
    });

    await this.invalidatePaymentCache(payment.id);

    if (status === 'completed') {
      await this.eventBus.emit('payment.completed', { paymentId: payment.id } as PaymentCompletedEvent);
    } else if (status === 'failed') {
      await this.eventBus.emit('payment.failed', { paymentId: payment.id } as PaymentFailedEvent);
    }

    this.logger.info(`Paymob webhook processed: transactionId=${transactionId}, status=${status}`, 'PaymentsService');
    return { status: 'processed' };
  }

  /**
   * Refuses a delivery whose captured amount is not the amount on record.
   *
   * The payment is deliberately NOT transitioned and the gateway transaction is not recorded: the
   * money that arrived is not the money that was asked for, so the only honest local state is "we do
   * not know what this payment is". Rejecting with a 400 makes Paymob retry, which is what should
   * happen for a delivery this server cannot account for — and an operator sees the mismatch in the
   * error log with both numbers in it.
   *
   * A delivery that carries no amount at all is treated the same way. It cannot be distinguished
   * from an under-collected capture, and marking such a payment completed would collect the balance
   * on the next webhook or never.
   */
  private assertCapturedAmountMatches(
    payment: Payment,
    capturedAmountCents: number | undefined,
    transactionId: string,
    orderId: string,
  ): void {
    if (capturedAmountCents === undefined) {
      this.logger.error(
        `Paymob delivery ${transactionId} for order ${orderId} carries no amount_cents, so the capture cannot be verified against payment ${payment.id} (expected ${payment.amount} ${payment.currency}); the payment was NOT completed`,
      );
      throw new BadRequestException(
        `Webhook payload carries no amount, so the capture cannot be verified against payment ${payment.id}`,
      );
    }

    if (capturedAmountCents !== payment.amount) {
      this.logger.error(
        `Paymob captured ${capturedAmountCents} for payment ${payment.id} but ${payment.amount} was expected; the payment was NOT completed`,
      );
      throw new BadRequestException(
        `Captured amount ${capturedAmountCents} does not match the recorded amount ${payment.amount}`,
      );
    }
  }

  private toPaymentResponse(payment: Payment): PaymentResponse {
    return {
      id: payment.id,
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      paymobOrderId: payment.paymobOrderId,
      paymobPaymentId: payment.paymobPaymentId,
      paymobTransactionId: payment.paymobTransactionId,
      paymobPaymentKey: payment.paymobPaymentKey,
      paymobIframeUrl: payment.paymobIframeUrl,
      paymobAcceptUrl: payment.paymobAcceptUrl,
      description: payment.description,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }

  private toRefundResponse(refund: Refund): RefundResponse {
    return {
      id: refund.id,
      paymentId: refund.paymentId,
      amount: refund.amount,
      currency: refund.currency,
      reason: refund.reason,
      status: refund.status,
      paymobRefundId: refund.paymobRefundId,
      createdAt: refund.createdAt.toISOString(),
    };
  }
}
