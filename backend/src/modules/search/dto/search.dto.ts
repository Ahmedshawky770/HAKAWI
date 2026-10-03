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

/**
 * Runtime class for `GET /search/authors`.
 *
 * WHY THIS EXISTS. The route took `@Query('limit') limit?: string` and passed
 * `Number(limit) || 20` straight through, so `?limit=999999999` was accepted and handed to
 * `LIMIT`. A negative value was worse: `Number('-5')` is truthy, so it reached Postgres and came
 * back as `ERROR: LIMIT must not be negative`, which `AllExceptionsFilter` renders as an opaque 500
 * rather than a 400.
 *
 * The decorators copy `SearchFiltersDto`'s own `page`/`limit` block verbatim, so the ceiling is the
 * one the rest of the codebase already applies rather than a new number invented here.
 */
export class SearchAuthorsQueryDto {
  @IsString({ message: 'Query parameter "q" is required' })
  q: string;

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
