import { IsString, IsOptional, IsUUID, IsIn, IsInt, Min, Max } from 'class-validator';

export const SEARCH_SORT_FIELDS = ['relevance', 'date', 'views', 'reactions'] as const;

/**
 * The sort union, DERIVED from the list the `@IsIn` above validates against.
 *
 * WHY IT LIVES HERE AND NOT IN `types.ts`. `SearchFilters.sortBy` used to spell the same four
 * values out as a literal union, a second copy of `SEARCH_SORT_FIELDS` (Principle #9). Both
 * copies typechecked, so adding a fifth sort to the runtime whitelist would have widened the DTO
 * while leaving the service contract saying the old thing — and the repository, which is where the
 * ordering actually happens, took `sortBy: string`, so nothing narrowed it anywhere. Deriving the
 * type from the same tuple means a sort that is not validated cannot be typed, and the repository's
 * `orderBy` resolution becomes exhaustive over a closed union instead of a chain of string
 * comparisons against an open one.
 */
export type SearchSortField = (typeof SEARCH_SORT_FIELDS)[number];

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
