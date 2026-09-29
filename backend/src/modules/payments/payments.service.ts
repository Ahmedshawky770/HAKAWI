import * as crypto from 'crypto';

import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import type { PaymentCreatedEvent, PaymentCompletedEvent, PaymentFailedEvent, RefundCreatedEvent } from '../../common/events/payments.events.ts';

import type { IPaymentsRepository, Payment, CreatePaymentInput, PaymentTransaction, Refund } from './interfaces/payments-repository.interface.ts';
import { PAYMENTS_REPOSITORY } from './interfaces/payments-repository.interface.ts';
import type { PaymentResponse, PaymentsListResponse, RefundResponse } from './types.ts';

interface PaymobOrderResponse {
  paymentId: string;
  orderId: string;
  paymobUrl: string;
}

type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';

const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ['processing', 'completed', 'failed', 'cancelled'],
  processing: ['completed', 'failed'],
  completed: ['refunded'],
  failed: [],
  cancelled: [],
  refunded: [],
};

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENTS_REPOSITORY) private readonly paymentsRepository: IPaymentsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  validateStatusTransition(currentStatus: PaymentStatus, newStatus: PaymentStatus): void {
    const allowed = PAYMENT_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Invalid payment status transition from ${currentStatus} to ${newStatus}`);
    }
  }

  validateWebhookSignature(rawBody: string, signature: string | undefined, secret: string | undefined): void {
    if (!secret) {
      throw new BadRequestException('Webhook secret is not configured');
    }

    if (!signature) {
      throw new BadRequestException('Missing webhook signature');
    }

    const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    if (signature !== expectedSignature) {
      throw new BadRequestException('Invalid webhook signature');
    }
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    this.logger.info(`Creating payment for user: ${input.userId}, amount: ${input.amount}`);

    const data: CreatePaymentInput = {
      ...input,
      currency: input.currency ?? 'EGP',
      status: 'pending',
      metadata: input.metadata ?? null,
    };

    const payment = await this.paymentsRepository.create(data);
    await this.eventBus.emit('payment.created', { paymentId: payment.id, userId: input.userId } as PaymentCreatedEvent);
    return payment;
  }

  async findById(id: string): Promise<Payment> {
    const cached = await this.valkeyService.get(`payment:${id}`);
    if (cached) {
      return JSON.parse(cached) as Payment;
    }

    const payment = await this.paymentsRepository.findById(id);
    if (!payment || payment.deletedAt) {
      throw new NotFoundException('Payment not found');
    }

    await this.valkeyService.set(`payment:${id}`, JSON.stringify(payment), 300);
    return payment;
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    return this.paymentsRepository.findByOrderId(orderId);
  }

  async findAll(params: { userId?: string; status?: string; page?: number; limit?: number }): Promise<PaymentsListResponse> {
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
    await this.valkeyService.del(`payment:${id}`);

    if (status === 'completed') {
      await this.eventBus.emit('payment.completed', { paymentId: id } as PaymentCompletedEvent);
    } else if (status === 'failed') {
      await this.eventBus.emit('payment.failed', { paymentId: id } as PaymentFailedEvent);
    }

    return payment;
  }

  async createTransaction(paymentId: string, type: string, status: string, amount: number, gatewayResponse?: Record<string, unknown> | null): Promise<PaymentTransaction> {
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
    const payment = await this.paymentsRepository.findById(paymentId);
    if (!payment || payment.deletedAt) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status !== 'completed') {
      throw new BadRequestException('Cannot refund a payment that is not completed');
    }

    const refund = await this.paymentsRepository.createRefund({
      paymentId,
      amount,
      currency: payment.currency,
      reason: reason ?? null,
      status: 'pending',
      metadata: null,
    });

    await this.eventBus.emit('refund.created', { paymentId, refundId: refund.id } as RefundCreatedEvent);
    return refund;
  }

  async paymobInitializePayment(userId: string, amount: number, currency: string, metadata?: Record<string, unknown>): Promise<PaymobOrderResponse> {
    this.logger.info(`Initializing Paymob payment for user: ${userId}, amount: ${amount}`);

    const payment = await this.createPayment({
      userId,
      amount,
      currency,
      paymentMethod: 'paymob',
      description: metadata?.description as string | null ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    const orderId = `order_${payment.id}_${Date.now()}`;
    const paymobUrl = `https://secure.accepting.com/collect/paymob/${orderId}`;

    await this.paymentsRepository.update(payment.id, {
      paymobOrderId: orderId,
      status: 'processing',
    });

    this.logger.info(`Paymob payment initialized: ${orderId}`);
    return { paymentId: payment.id, orderId, paymobUrl };
  }

  async paymobCallback(orderId: string, paymentId: string, transactionId: string, status: string): Promise<Payment> {
    this.logger.info(`Paymob callback received: orderId=${orderId}, paymentId=${paymentId}, transactionId=${transactionId}, status=${status}`);

    const payment = await this.paymentsRepository.findByOrderId(orderId);
    if (!payment) {
      throw new NotFoundException('Payment not found for order');
    }

    const paymentStatus = status === 'success' ? 'completed' : 'failed';
    const updatedPayment = await this.updateStatus(payment.id, paymentStatus);

    await this.paymentsRepository.update(payment.id, {
      paymobPaymentId: paymentId,
      paymobTransactionId: transactionId,
    });

    await this.createTransaction(payment.id, 'capture', paymentStatus, payment.amount, { orderId, paymentId, transactionId });

    return updatedPayment;
  }

  async getRefunds(paymentId: string): Promise<RefundResponse[]> {
    const refunds = await this.paymentsRepository.findRefundsByPayment(paymentId);
    return refunds.map((refund) => ({
      id: refund.id,
      paymentId: refund.paymentId,
      amount: refund.amount,
      currency: refund.currency,
      reason: refund.reason,
      status: refund.status,
      paymobRefundId: refund.paymobRefundId,
      createdAt: refund.createdAt.toISOString(),
    }));
  }

  async handlePaymobWebhook(rawBody: string, signature?: string): Promise<{ status: string }> {
    const webhookSecret = process.env.PAYMOB_WEBHOOK_SECRET;
    this.validateWebhookSignature(rawBody, signature, webhookSecret);

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }

    const transactionId = payload.transaction_id as string | undefined;
    if (!transactionId) {
      throw new BadRequestException('Missing transaction_id in webhook payload');
    }

    const existing = await this.paymentsRepository.findByTransactionId(transactionId);
    if (existing?.status === 'completed') {
      return { status: 'already_processed' };
    }

    const payment = existing ?? (await this.paymentsRepository.findByOrderId(payload.order_id as string));
    if (!payment) {
      throw new NotFoundException('Payment not found for webhook');
    }

    const status = payload.status === 'success' ? 'completed' : 'failed';
    this.validateStatusTransition(payment.status as PaymentStatus, status as PaymentStatus);

    await this.paymentsRepository.update(payment.id, {
      status,
      paymobPaymentId: (payload.payment_id as string | null) ?? payment.paymobPaymentId,
      paymobTransactionId: transactionId,
      metadata: JSON.stringify(payload),
    });

    await this.valkeyService.del(`payment:${payment.id}`);

    if (status === 'completed') {
      await this.eventBus.emit('payment.completed', { paymentId: payment.id } as PaymentCompletedEvent);
    } else if (status === 'failed') {
      await this.eventBus.emit('payment.failed', { paymentId: payment.id } as PaymentFailedEvent);
    }

    this.logger.info(`Paymob webhook processed: transactionId=${transactionId}, status=${status}`, 'PaymentsService');
    return { status: 'processed' };
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
