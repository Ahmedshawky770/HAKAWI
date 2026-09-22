import { IsString, IsEnum, IsDateString, IsNumber, IsInt } from 'class-validator';

export const RentalDurationValues = ['one_day', 'three_days', 'one_week', 'two_weeks', 'one_month', 'three_months'] as const;

export type RentalDuration = typeof RentalDurationValues[number];

export class RentBookDto {
  @IsString()
  bookId: string;

  @IsEnum(RentalDurationValues, { message: 'Invalid rental duration' })
  rentalDuration: RentalDuration;
}

export class RentalResponseDto {
  id: string;
  bookId: string;
  renterId: string;
  rentalDuration: string;
  rentalPrice: number;
  platformCommission: number;
  ownerEarnings: number;
  status: string;
  startDate: Date;
  endDate: Date;
  extensionCount: number;
  createdAt: Date;
}
