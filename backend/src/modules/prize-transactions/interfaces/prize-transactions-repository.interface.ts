import { symbol } from '../utils/symbol.util.js';
import type { PrizeTransaction } from '../../../db/schema/prize-transactions.schema.js';
import type { NewPrizeTransaction } from '../../../db/schema/prize-transactions.schema.js';

export const PRIZE_TRANSACTIONS_REPOSITORY = symbol('PRIZE_TRANSACTIONS_REPOSITORY');

export type CreatePrizeTransactionData = NewPrizeTransaction;
export type UpdatePrizeTransactionData = Partial<CreatePrizeTransactionData>;

export interface IPrizeTransactionsRepository {
  findById(id: string): Promise<PrizeTransaction | null>;
  findByContestId(contestId: string): Promise<PrizeTransaction[]>;
  findByUserId(userId: string): Promise<PrizeTransaction[]>;
  create(data: CreatePrizeTransactionData): Promise<PrizeTransaction>;
  update(id: string, data: Partial<UpdatePrizeTransactionData>): Promise<PrizeTransaction>;
}
