import { IsString, IsOptional, IsUUID, IsInt, Min, Max, IsIn } from 'class-validator';

export class CreateRentalDto {
  @IsUUID('4', { message: 'Book ID must be a valid UUID' })
  bookId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  durationDays?: number;
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
