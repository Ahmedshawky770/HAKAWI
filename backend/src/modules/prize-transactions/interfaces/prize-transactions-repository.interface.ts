export interface IPrizeTransactionsRepository {
  findById(id: string): Promise<PrizeTransaction | null>;
  findByContestId(contestId: string): Promise<PrizeTransaction[]>;
  findByUserId(userId: string): Promise<PrizeTransaction[]>;
  create(data: CreatePrizeTransactionData): Promise<PrizeTransaction>;
  update(id: string, data: Partial<UpdatePrizeTransactionData>): Promise<PrizeTransaction>;
}

export interface PrizeTransaction {
  id: string;
  contestId: string;
  userId: string;
  amount: number;
  status: string;
  transactionId: string | null;
  createdAt: Date;
}

export interface CreatePrizeTransactionData {
  contestId: string;
  userId: string;
  amount: number;
  status: string;
  transactionId?: string | null;
}

export interface UpdatePrizeTransactionData extends Partial<Pick<PrizeTransaction, 'status' | 'transactionId'>> {}

export const PRIZE_TRANSACTIONS_REPOSITORY = 'PRIZE_TRANSACTIONS_REPOSITORY';
