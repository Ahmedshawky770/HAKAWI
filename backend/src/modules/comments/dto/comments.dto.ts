import { IsString, IsUUID, IsOptional, MaxLength, MinLength, IsInt, Min, Max } from 'class-validator';

export class CreateCommentDto {
  @IsUUID('4', { message: 'Story ID must be a valid UUID' })
  storyId: string;

  @IsString()
  @MinLength(1, { message: 'Comment content is required' })
  @MaxLength(2000, { message: 'Comment must not exceed 2000 characters' })
  content: string;

  @IsOptional()
  @IsUUID('4', { message: 'Parent comment ID must be a valid UUID' })
  parentId?: string;
}

export class UpdateCommentDto {
  @IsString()
  @MinLength(1, { message: 'Comment content is required' })
  @MaxLength(2000, { message: 'Comment must not exceed 2000 characters' })
  content: string;
}

/**
 * `page` / `limit` for the comment list and the reply list.
 *
 * `Number(limit) || 20` accepted `999999999` and — because `Number('-5')` is truthy — `-5` as
 * well, which reached Postgres as `LIMIT must not be negative` and came back through
 * `AllExceptionsFilter` as a 500 rather than a 400. The ceiling and the integer check copy the
 * pattern already used by `SearchFiltersDto` and `NotificationQueryDto`.
 */
export class CommentPageQueryDto {
  @IsOptional()
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be greater than zero' })
  page?: number;

  @IsOptional()
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be greater than zero' })
  @Max(100, { message: 'Limit must not exceed 100' })
  limit?: number;
}
