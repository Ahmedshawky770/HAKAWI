import { IsString, IsOptional, MaxLength, MinLength, IsInt, Min, Max, Matches, IsIn } from 'class-validator';

export class CreatePaymentDto {
  // WHY there is no `userId`: the owner of a payment is the authenticated caller, taken from the JWT
  // subject by the controller. The field used to be required here and then ignored, which meant every
  // caller had to invent a UUID to satisfy validation while the value played no part — and, with the
  // global `forbidNonWhitelisted` pipe, a caller who sent somebody else's id would be rejected rather
  // than confused. Deriving ownership from the token is the only rule that cannot be spoofed.

  @IsInt({ message: 'Amount must be an integer number of minor units (piastres/cents)' })
  @Min(1, { message: 'Amount must be greater than 0' })
  @Max(9_999_999_999, { message: 'Amount exceeds the maximum single charge' })
  amount: number;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Currency code must be exactly 3 characters' })
  @MaxLength(3, { message: 'Currency code must be exactly 3 characters' })
  @Matches(/^[A-Za-z]{3}$/, { message: 'Currency must be a three letter ISO 4217 code' })
  currency?: string;

  @IsString()
  @MaxLength(50, { message: 'Payment method must not exceed 50 characters' })
  paymentMethod: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;
}

export class UpdatePaymentStatusDto {
  @IsIn(['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'], {
    message: 'Status must be one of: pending, processing, completed, failed, cancelled, refunded',
  })
  status: string;
}

export class CreateRefundDto {
  @IsInt({ message: 'Refund amount must be an integer number of minor units (piastres/cents)' })
  @Min(1, { message: 'Refund amount must be greater than 0' })
  @Max(9_999_999_999, { message: 'Refund amount exceeds the maximum single charge' })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason?: string;
}

export class PaymentsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
