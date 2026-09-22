import { IsString, IsInt, IsOptional, IsNumber, Min, Max, IsBoolean, IsArray, IsDateString, MaxLength, IsIn } from 'class-validator';

export class CreateBookDto {
  @IsString()
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Subtitle must not exceed 255 characters' })
  subtitle?: string;

  @IsString()
  @MaxLength(255, { message: 'Author name must not exceed 255 characters' })
  authorName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Cover image URL must not exceed 500 characters' })
  coverImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'PDF URL must not exceed 500 characters' })
  pdfUrl?: string;

  @IsOptional()
  @IsInt()
  pdfPages?: number;

  @IsNumber()
  @Min(0, { message: 'Price must be at least 0' })
  price: number;

  @IsBoolean()
  isAvailable: boolean = true;
}

export class UpdateBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Subtitle must not exceed 255 characters' })
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Author name must not exceed 255 characters' })
  authorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Cover image URL must not exceed 500 characters' })
  coverImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'PDF URL must not exceed 500 characters' })
  pdfUrl?: string;

  @IsOptional()
  @IsInt()
  pdfPages?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Price must be at least 0' })
  price?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class BookResponseDto {
  id: string;
  ownerId: string;
  title: string;
  subtitle: string;
  authorName: string;
  coverImage: string;
  pdfUrl: string;
  pdfPages: number;
  price: number;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class BookFiltersDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Minimum price must be at least 0' })
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Maximum price must be at least 0' })
  maxPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
