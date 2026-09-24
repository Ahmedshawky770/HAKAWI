import { IsString, IsOptional, IsUUID, IsIn, MaxLength, MinLength, IsBoolean, IsInt, Min, Max, Matches, IsNumber, Min as MinNumber } from 'class-validator';

export class CreateBookDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title: string;

  @IsString()
  @MinLength(1, { message: 'Author is required' })
  @MaxLength(255, { message: 'Author must not exceed 255 characters' })
  author: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Description must not exceed 5000 characters' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Cover image URL must not exceed 500 characters' })
  coverImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'ISBN must not exceed 20 characters' })
  @Matches(/^(?:\d{10}|\d{13})$/, { message: 'ISBN must be 10 or 13 digits' })
  isbn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Publisher must not exceed 255 characters' })
  publisher?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Language must not exceed 50 characters' })
  language?: string;

  @IsOptional()
  @IsInt()
  @MinNumber(1)
  pageCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'File URL must not exceed 500 characters' })
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'File type must not exceed 50 characters' })
  fileType?: string;

  @IsOptional()
  @IsNumber()
  @MinNumber(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;
}

export class UpdateBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Author must not exceed 255 characters' })
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Description must not exceed 5000 characters' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Cover image URL must not exceed 500 characters' })
  coverImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'ISBN must not exceed 20 characters' })
  isbn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Publisher must not exceed 255 characters' })
  publisher?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Language must not exceed 50 characters' })
  language?: string;

  @IsOptional()
  @IsInt()
  @MinNumber(1)
  pageCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'File URL must not exceed 500 characters' })
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'File type must not exceed 50 characters' })
  fileType?: string;

  @IsOptional()
  @IsNumber()
  @MinNumber(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsIn(['draft', 'published', 'archived'], { message: 'Status must be draft, published, or archived' })
  status?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;
}

export class BooksQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsIn(['draft', 'published', 'archived'], { message: 'Status must be draft, published, or archived' })
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
