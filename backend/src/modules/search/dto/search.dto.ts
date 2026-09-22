import { IsString, IsInt, Min, Max, IsOptional, IsArray, MinLength, MaxLength } from 'class-validator';

export class SearchQueryDto {
  @IsString()
  @MinLength(2, { message: 'Query must be at least 2 characters' })
  @MaxLength(100, { message: 'Query must not exceed 100 characters' })
  q: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50, { message: 'Limit must not exceed 50' })
  limit: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;
}

export class SearchResultDto<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class SearchSuggestionDto {
  @IsString()
  @MinLength(2, { message: 'Query must be at least 2 characters' })
  query: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit: number = 10;
}
