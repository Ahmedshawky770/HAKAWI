import { IsString, IsOptional, IsUUID, IsIn, IsInt, Min, Max } from 'class-validator';

export class AddToLibraryDto {
  @IsUUID('4', { message: 'Book ID must be a valid UUID' })
  bookId: string;

  @IsOptional()
  @IsUUID('4', { message: 'Rental ID must be a valid UUID' })
  rentalId?: string;
}

export class LibraryQueryDto {
  @IsOptional()
  @IsIn(['owned', 'rented', 'reading', 'completed'], {
    message: 'Status must be one of: owned, rented, reading, completed',
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
