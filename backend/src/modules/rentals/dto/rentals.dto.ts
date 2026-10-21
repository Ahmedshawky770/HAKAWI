import { IsOptional, IsInt, Min, Max, IsIn, ValidateIf } from 'class-validator';

import {
  PAYMOB_PAYMENT_METHOD_CHOICES,
  type PaymobPaymentMethodChoice,
} from '../../../config/paymob.config.ts';

export const RENTAL_DURATION_PRESETS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
] as const;

export type RentalDurationPreset = (typeof RENTAL_DURATION_PRESETS)[number]['days'];

export class ExtendRentalDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  extensionDays?: number;

  /**
   * THE READER'S CHOICE OF INSTRUMENT, FOR THE EXTENSION.
   *
   * An extension is a PAYMENT — it takes money, exactly like the rental it
   * extends — and it used to be the one path in the product that asked the
   * reader nothing about the instrument and then told the gateway nothing
   * either. The question was asked on the checkout panel for the rental and
   * never for the extension, so the answer was silently dropped here.
   *
   * The same two words, the same resolver, the same merchant's ids.
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(PAYMOB_PAYMENT_METHOD_CHOICES, {
    message: `Payment method must be one of: ${PAYMOB_PAYMENT_METHOD_CHOICES.join(', ')}`,
  })
  paymentMethod?: PaymobPaymentMethodChoice;
}

export class RentalsQueryDto {
  @IsOptional()
  @IsIn(['active', 'expired', 'returned', 'cancelled'], {
    message: 'Status must be one of: active, expired, returned, cancelled',
  })
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
