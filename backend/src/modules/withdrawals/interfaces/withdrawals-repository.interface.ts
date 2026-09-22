import { symbol } from '../../common/utils/symbol.util.js';
import type { Withdrawal } from '../../../db/schema/withdrawals.schema.js';
import type { NewWithdrawal } from '../../../db/schema/withdrawals.schema.js';

export const WITHDRAWALS_REPOSITORY = symbol('WITHDRAWALS_REPOSITORY');

export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type CreateWithdrawalData = NewWithdrawal;
export type UpdateWithdrawalData = Partial<CreateWithdrawalData>;

export { Withdrawal };

export interface IWithdrawalsRepository {
  findById(id: string): Promise<Withdrawal | null>;
  findByUserId(userId: string): Promise<Withdrawal[]>;
  findByStatus(status: WithdrawalStatus): Promise<Withdrawal[]>;
  create(data: CreateWithdrawalData): Promise<Withdrawal>;
  update(id: string, data: Partial<UpdateWithdrawalData>): Promise<Withdrawal>;
}
