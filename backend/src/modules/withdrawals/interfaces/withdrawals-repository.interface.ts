export interface IWithdrawalsRepository {
  findById(id: string): Promise<Withdrawal | null>;
  findByUserId(userId: string): Promise<Withdrawal[]>;
  findByStatus(status: WithdrawalStatus): Promise<Withdrawal[]>;
  create(data: CreateWithdrawalData): Promise<Withdrawal>;
  update(id: string, data: Partial<UpdateWithdrawalData>): Promise<Withdrawal>;
}

export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: WithdrawalStatus;
  transactionId: string | null;
  notes: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWithdrawalData {
  userId: string;
  amount: number;
  currency: string;
  status: WithdrawalStatus;
  transactionId?: string | null;
  notes?: string | null;
}

export interface UpdateWithdrawalData extends Partial<Pick<Withdrawal, 'status' | 'transactionId' | 'notes' | 'processedAt'>> {}

export const WITHDRAWALS_REPOSITORY = 'WITHDRAWALS_REPOSITORY';
