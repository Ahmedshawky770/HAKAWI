import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { PaymentCreatedEvent, PaymentCompletedEvent, PaymentFailedEvent, RefundCreatedEvent, RefundCompletedEvent } from '../../../common/events/payments.events.ts';
import type { IPaymentsRepository } from '../interfaces/payments-repository.interface.ts';
import { PAYMENTS_REPOSITORY } from '../interfaces/payments-repository.interface.ts';

@Injectable()
export class PaymentsEventHandler {
  constructor(
    @Inject(PAYMENTS_REPOSITORY) private readonly paymentsRepository: IPaymentsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('payment.created')
  async handlePaymentCreated(event: PaymentCreatedEvent): Promise<void> {
    this.logger.info(`Handling payment created event: ${event.paymentId}`, 'PaymentsEventHandler');
  }

  @OnEvent('payment.completed')
  async handlePaymentCompleted(event: PaymentCompletedEvent): Promise<void> {
    this.logger.info(`Handling payment completed event: ${event.paymentId}`, 'PaymentsEventHandler');
  }

  @OnEvent('payment.failed')
  async handlePaymentFailed(event: PaymentFailedEvent): Promise<void> {
    this.logger.info(`Handling payment failed event: ${event.paymentId}`, 'PaymentsEventHandler');
  }

  @OnEvent('refund.created')
  async handleRefundCreated(event: RefundCreatedEvent): Promise<void> {
    this.logger.info(`Handling refund created event: ${event.refundId}`, 'PaymentsEventHandler');
  }

  @OnEvent('refund.completed')
  async handleRefundCompleted(event: RefundCompletedEvent): Promise<void> {
    this.logger.info(`Handling refund completed event: ${event.refundId}`, 'PaymentsEventHandler');
  }
}
