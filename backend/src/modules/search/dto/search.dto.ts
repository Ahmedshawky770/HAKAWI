import { IsString, IsOptional, IsUUID, IsIn, IsInt, Min, Max } from 'class-validator';

export const SEARCH_SORT_FIELDS = ['relevance', 'date', 'views', 'reactions'] as const;

export const SEARCH_STATUSES = ['draft', 'published', 'archived'] as const;

/**
 * Runtime class for `GET /search`. A type alias would erase to `Object` at compile
 * time, so the global `ValidationPipe` would have no metadata to validate against
 * and every query string would reach the repository verbatim.
 */
export class SearchFiltersDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Author ID must be a valid UUID' })
  authorId?: string;

  @IsOptional()
  @IsIn(SEARCH_STATUSES, { message: 'Status must be draft, published, or archived' })
  status?: string;

  @IsOptional()
  @IsIn(SEARCH_SORT_FIELDS, { message: 'Sort by must be relevance, date, views, or reactions' })
  sortBy?: (typeof SEARCH_SORT_FIELDS)[number];

  @IsOptional()
  @IsInt({ message: 'Page must be an integer' })
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1)
  @Max(100)
  limit?: number;
}
