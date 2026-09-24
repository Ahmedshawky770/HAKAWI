import { IsString, IsOptional, IsUUID, MaxLength, IsBoolean, IsInt, Min, Max, IsNumber, Min as MinNumber, IsIn } from 'class-validator';

export class CreatePaymentDto {
  @IsUUID('4', { message: 'User ID must be a valid UUID' })
  userId: string;

  @IsNumber()
  @MinNumber(1, { message: 'Amount must be greater than 0' })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(3, { message: 'Currency code must not exceed 3 characters' })
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
  @IsNumber()
  @MinNumber(1, { message: 'Refund amount must be greater than 0' })
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
