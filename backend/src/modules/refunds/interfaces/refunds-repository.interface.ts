import { symbol } from '../utils/symbol.util.js';
import type { Refund } from '../../../db/schema/refunds.schema.js';
import type { NewRefund } from '../../../db/schema/refunds.schema.js';

export const REFUNDS_REPOSITORY = symbol('REFUNDS_REPOSITORY');

export type CreateRefundData = NewRefund;

export interface IRefundsRepository {
  findById(id: string): Promise<Refund | null>;
  findByPaymentId(paymentId: string): Promise<Refund | null>;
  findByRefundedBy(refundedBy: string): Promise<Refund[]>;
  create(data: CreateRefundData): Promise<Refund>;
}
