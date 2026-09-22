export interface IPaymentsRepository {
  findById(id: string): Promise<Payment | null>;
  findByUserId(userId: string): Promise<Payment[]>;
  findByTransactionId(transactionId: string): Promise<Payment | null>;
  findByStatus(status: PaymentStatus): Promise<Payment[]>;
  create(data: CreatePaymentData): Promise<Payment>;
  update(id: string, data: Partial<UpdatePaymentData>): Promise<Payment>;
}

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  transactionId: string | null;
  paymentMethodId: string | null;
  metadata: Record<string, unknown> | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentData {
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  transactionId?: string | null;
  paymentMethodId?: string | null;
  metadata?: Record<string, unknown> | null;
  completedAt?: Date | null;
}

export interface UpdatePaymentData extends Partial<Pick<Payment, 'status' | 'transactionId' | 'paymentMethodId' | 'metadata' | 'completedAt'>> {}

export const PAYMENTS_REPOSITORY = 'PAYMENTS_REPOSITORY';
