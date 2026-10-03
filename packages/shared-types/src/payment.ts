import { isOneOf } from './common.js';
import type { NamedPaginated, NamedTotal } from './common.js';

export const PAYMENT_STATUSES = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const isPaymentStatus = (value: string): value is PaymentStatus => isOneOf(PAYMENT_STATUSES, value);

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
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentsListResponse = NamedPaginated<'payments', Payment>;

export type PaymentRefund = {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  paymobRefundId: string | null;
  createdAt: string;
};

export type PaymentRefundsResponse = NamedTotal<'refunds', PaymentRefund>;

export const RENTAL_STATUSES = ['active', 'expired', 'returned', 'cancelled'] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export const isRentalStatus = (value: string): value is RentalStatus => isOneOf(RENTAL_STATUSES, value);

export type Rental = {
  id: string;
  userId: string;
  bookId: string;
  status: string;
  startDate: string;
  endDate: string;
  extendedCount: number;
  maxExtensions: number;
  returnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RentalsListResponse = NamedPaginated<'rentals', Rental>;

export type RentalExtension = {
  id: string;
  rentalId: string;
  previousEndDate: string;
  newEndDate: string;
  extensionDays: number;
  createdAt: string;
};

export type PurchaseResult = {
  paymentId: string;
  orderId: string;
  paymobUrl: string;
};
