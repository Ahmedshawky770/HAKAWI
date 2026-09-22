export interface ITransactionsRepository {
  findById(id: string): Promise<Transaction | null>;
  findByPaymentId(paymentId: string): Promise<Transaction[]>;
  findByUserId(userId: string): Promise<Transaction[]>;
  create(data: CreateTransactionData): Promise<Transaction>;
}

export type TransactionType = 'purchase' | 'rental' | 'prize' | 'refund' | 'withdrawal';

export interface Transaction {
  id: string;
  paymentId: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreateTransactionData {
  paymentId: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: string;
  description: string;
  metadata?: Record<string, unknown> | null;
}

export const TRANSACTIONS_REPOSITORY = 'TRANSACTIONS_REPOSITORY';
