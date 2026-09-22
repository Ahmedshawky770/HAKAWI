import { symbol } from '../utils/symbol.util.js';
import type { Payment } from '../../../db/schema/payments.schema.js';
import type { NewPayment } from '../../../db/schema/payments.schema.js';

export const PAYMENTS_REPOSITORY = symbol('PAYMENTS_REPOSITORY');

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export type CreatePaymentData = NewPayment;
export type UpdatePaymentData = Partial<CreatePaymentData>;

export interface IPaymentsRepository {
  findById(id: string): Promise<Payment | null>;
  findByUserId(userId: string): Promise<Payment[]>;
  findByTransactionId(transactionId: string): Promise<Payment | null>;
  findByStatus(status: PaymentStatus): Promise<Payment[]>;
  create(data: CreatePaymentData): Promise<Payment>;
  update(id: string, data: Partial<UpdatePaymentData>): Promise<Payment>;
}
