import { IsString, IsInt, Min, Max, IsOptional, MaxLength } from 'class-validator';

export class CreateBookReviewDto {
  @IsString()
  bookId: string;

  @IsInt()
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating must not exceed 5' })
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Comment must not exceed 1000 characters' })
  comment?: string;
}

export class BookReviewResponseDto {
  id: string;
  bookId: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}
