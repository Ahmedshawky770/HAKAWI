import { IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';

export class CreateReadingProgressDto {
  @IsUUID('4', { message: 'Book ID must be a valid UUID' })
  bookId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  currentPage?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalPages?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercentage?: number;
}

export class UpdateReadingProgressDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  currentPage?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalPages?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercentage?: number;
}

export class ReadingProgressQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'Book ID must be a valid UUID' })
  bookId?: string;

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
