export type PaymentResponse = {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  /**
   * THE GATEWAY. Every Paymob payment says "paymob", which says nothing about
   * how the reader is paying.
   */
  paymentMethod: string;
  /**
   * THE INSTRUMENT THE READER CHOSE — "card" or "wallet".
   *
   * The choice was kept in the payment's metadata, where nothing outside the
   * payments module could read it. So the product could not show a reader what
   * they chose, and a support agent could not tell a card payment from a
   * wallet one without opening the raw record.
   *
   * `null` when there is no choice to report: a payment made before the choice
   * existed, or one where the gateway let the customer choose inside the frame
   * because the merchant had configured no id for either instrument.
   */
  instrument: string | null;
  paymobOrderId: string | null;
  paymobPaymentId: string | null;
  paymobTransactionId: string | null;
  paymobPaymentKey: string | null;
  paymobIframeUrl: string | null;
  paymobAcceptUrl: string | null;
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

export type PaymobCheckoutResponse = {
  paymentId: string;
  orderId: string;
  paymentKey: string;
  iframeUrl: string;
  acceptUrl: string;
  status: string;
};
