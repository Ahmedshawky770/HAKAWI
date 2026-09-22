import { IsString, IsNumber, IsEnum, IsObject, IsDateString } from 'class-validator';

export class TransactionResponseDto {
  id: string;
  paymentId: string;
  userId: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
