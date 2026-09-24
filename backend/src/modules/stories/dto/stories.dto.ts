import { IsString, IsOptional, IsUUID, IsIn, MaxLength, MinLength, IsBoolean, IsInt, Min, Max, Matches } from 'class-validator';

export class CreateStoryDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title: string;

  @IsString()
  @MinLength(1, { message: 'Slug is required' })
  @MaxLength(255, { message: 'Slug must not exceed 255 characters' })
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug can only contain lowercase letters, numbers, and hyphens' })
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Excerpt must not exceed 500 characters' })
  excerpt?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Cover image URL must not exceed 500 characters' })
  coverImage?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @IsOptional()
  @IsString()
  tags?: string[];
}

export class UpdateStoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Slug must not exceed 255 characters' })
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug can only contain lowercase letters, numbers, and hyphens' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Excerpt must not exceed 500 characters' })
  excerpt?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Cover image URL must not exceed 500 characters' })
  coverImage?: string;

  @IsOptional()
  @IsIn(['draft', 'published', 'archived'], { message: 'Status must be draft, published, or archived' })
  status?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;
}

export class PublishStoryDto {
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class StoriesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

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
