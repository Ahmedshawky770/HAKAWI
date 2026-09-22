import { symbol } from '../utils/symbol.util.js';
import type { Transaction } from '../../../db/schema/transactions.schema.js';
import type { NewTransaction } from '../../../db/schema/transactions.schema.js';

export const TRANSACTIONS_REPOSITORY = symbol('TRANSACTIONS_REPOSITORY');

export type CreateTransactionData = NewTransaction;

export interface ITransactionsRepository {
  findById(id: string): Promise<Transaction | null>;
  findByPaymentId(paymentId: string): Promise<Transaction[]>;
  findByUserId(userId: string): Promise<Transaction[]>;
  create(data: CreateTransactionData): Promise<Transaction>;
}
