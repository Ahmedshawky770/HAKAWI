import { IsString, IsInt, IsOptional, IsArray, MaxLength, MinLength, IsNumber, Min, Max, IsEnum, IsBoolean, IsObject, IsDateString, IsIn } from 'class-validator';

export class CreateStoryDto {
  @IsString()
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Category must not exceed 100 characters' })
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateStoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Category must not exceed 100 characters' })
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  status?: string;
}

export class StoryResponseDto {
  id: string;
  sanityStoryId: string;
  authorId: string;
  title: string;
  slug: string;
  description: string;
  coverImage: string;
  status: string;
  wordCount: number;
  readingTime: number;
  views: number;
  reactions: number;
  comments: number;
  category: string;
  tags: string[];
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class StoryFiltersDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsString()
  status?: string;

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
