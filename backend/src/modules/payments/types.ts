export type PaymentResponse = {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  paymobOrderId: string | null;
  paymobPaymentId: string | null;
  paymobTransactionId: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentTransactionResponse = {
  id: string;
  paymentId: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  gatewayResponse: Record<string, unknown> | null;
  createdAt: string;
};

export type RefundResponse = {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  paymobRefundId: string | null;
  createdAt: string;
};

export type PaymentsListResponse = {
  payments: PaymentResponse[];
  total: number;
  page: number;
  limit: number;
};

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';
export type TransactionType = 'authorize' | 'capture' | 'void' | 'refund' | 'inquiry';
export type RefundStatus = 'pending' | 'processed' | 'failed' | 'cancelled';
