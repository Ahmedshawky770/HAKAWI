import { IsNumber, Min, IsString, IsOptional } from 'class-validator';

export class CreateWithdrawalDto {
  amount: number;

  currency: string;
}

export class WithdrawalResponseDto {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  transactionId: string;
  notes: string;
  requestedAt: Date;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
