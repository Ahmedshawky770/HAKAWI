export interface IRefundsRepository {
  findById(id: string): Promise<Refund | null>;
  findByPaymentId(paymentId: string): Promise<Refund | null>;
  findByRefundedBy(refundedBy: string): Promise<Refund[]>;
  create(data: CreateRefundData): Promise<Refund>;
}

export interface Refund {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  refundedBy: string;
  createdAt: Date;
}

export interface CreateRefundData {
  paymentId: string;
  amount: number;
  reason: string;
  refundedBy: string;
}

export const REFUNDS_REPOSITORY = 'REFUNDS_REPOSITORY';
