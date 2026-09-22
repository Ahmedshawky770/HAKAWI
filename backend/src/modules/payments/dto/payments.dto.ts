import { IsString, IsNumber, IsEnum, IsOptional, Min, MaxLength } from 'class-validator';

export const PaymentTypeValues = ['purchase', 'rental', 'prize'] as const;

export type PaymentType = typeof PaymentTypeValues[number];

export class CreatePaymentDto {
  amount: number;

  currency: string = 'EGP';

  type: PaymentType;

  bookId?: string;

  contestId?: string;
}

export class PaymentResponseDto {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  transactionId: string;
  paymentMethodId: string;
  metadata: Record<string, unknown>;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class RefundPaymentDto {
  @IsString()
  paymentId: string;

  @IsNumber()
  @Min(1, { message: 'Refund amount must be at least 1' })
  amount: number;

  @IsString()
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason: string;
}

export class RefundResponseDto {
  id: string;
  paymentId: string;
  amount: number;
  reason: string;
  refundedBy: string;
  createdAt: Date;
}
