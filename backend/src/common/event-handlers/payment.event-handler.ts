import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';

@Injectable()
export class PaymentEventHandler {
  private readonly logger: Logger;

  constructor(private readonly winstonLogger: WinstonLoggerService) {
    this.logger = new Logger(PaymentEventHandler.name);
  }

  @OnEvent('payment.initiated')
  async handlePaymentInitiated(event: { paymentId: string; userId: string; amount: number; currency: string }): Promise<void> {
    this.winstonLogger.log(`Payment initiated: ${event.paymentId} - ${event.amount} ${event.currency}`, 'PaymentEventHandler');
  }

  @OnEvent('payment.completed')
  async handlePaymentCompleted(event: { paymentId: string; userId: string; amount: number; transactionId: string }): Promise<void> {
    this.winstonLogger.log(`Payment completed: ${event.paymentId} - transaction ${event.transactionId}`, 'PaymentEventHandler');
  }
}
