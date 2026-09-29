import { IsOptional, IsUUID, IsInt, Min, Max, IsIn } from 'class-validator';

export const RENTAL_DURATION_PRESETS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
] as const;

export type RentalDurationPreset = typeof RENTAL_DURATION_PRESETS[number]['days'];

export class CreateRentalDto {
  @IsUUID('4', { message: 'Book ID must be a valid UUID' })
  bookId: string;

  @IsOptional()
  @IsIn([1, 3, 7, 14, 30, 90], { message: 'Duration must be one of: 1, 3, 7, 14, 30, 90 days' })
  durationDays?: RentalDurationPreset;
}

export class ExtendRentalDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  extensionDays?: number;
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
