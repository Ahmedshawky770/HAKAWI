import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { IPaymentsRepository, UpdatePaymentData } from '../interfaces/payments-repository.interface.js';
import { PAYMENTS_REPOSITORY } from '../interfaces/payments-repository.interface.js';
import { PaymentsRepository } from '../repositories/payments.repository.js';
import { CreatePaymentDto } from '../dto/payments.dto.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PAYMENTS_REPOSITORY) private readonly paymentsRepository: PaymentsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string, userId: string): Promise<unknown> {
    const payment = await this.paymentsRepository.findById(id);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if ((payment as { userId: string }).userId !== userId) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  async findByUserId(userId: string): Promise<unknown[]> {
    return this.paymentsRepository.findByUserId(userId);
  }

  async create(userId: string, data: CreatePaymentDto): Promise<unknown> {
    const payment = await this.paymentsRepository.create({ ...data, userId, status: 'pending' } as Parameters<typeof this.paymentsRepository.create>[0]);
    this.eventEmitter.emit('payment.initiated', { paymentId: (payment as { id: string }).id, userId, amount: data.amount, currency: data.currency });
    return payment;
  }

  async complete(paymentId: string, transactionId: string): Promise<unknown> {
    const payment = await this.paymentsRepository.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    const updated = await this.paymentsRepository.update(paymentId, { status: 'completed', transactionId, completedAt: new Date() } as UpdatePaymentData);
    this.eventEmitter.emit('payment.completed', { paymentId, userId: (payment as { userId: string }).userId, amount: (payment as { amount: number }).amount, transactionId });
    return updated;
  }

  async refund(paymentId: string, userId: string, refundDto: { amount: number; reason: string }): Promise<unknown> {
    const payment = await this.paymentsRepository.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if ((payment as { userId: string }).userId !== userId) {
      throw new NotFoundException('Payment not found');
    }
    if ((payment as { status: string }).status !== 'completed') {
      throw new BadRequestException('Only completed payments can be refunded');
    }
    return this.paymentsRepository.update(paymentId, { status: 'refunded' } as UpdatePaymentData);
  }
}
