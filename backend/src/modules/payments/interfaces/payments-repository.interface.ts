export const PAYMENTS_REPOSITORY = Symbol('PAYMENTS_REPOSITORY');

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

export interface IPaymentsRepository {
  findById(id: string): Promise<Payment | null>;
  findByOrderId(orderId: string): Promise<Payment | null>;
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
  findRefundsByPayment(paymentId: string): Promise<Refund[]>;
}
