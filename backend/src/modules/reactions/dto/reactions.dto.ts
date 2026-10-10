import { IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateReactionDto {
  @IsIn(['like', 'love', 'wow', 'sad', 'angry', 'haunted'], {
    message: 'Reaction type must be one of: like, love, wow, sad, angry, haunted',
  })
  type: string;
}

export class UpdateReactionDto {
  @IsIn(['like', 'love', 'wow', 'sad', 'angry', 'haunted'], {
    message: 'Reaction type must be one of: like, love, wow, sad, angry, haunted',
  })
  type: string;
}

/**
 * `page` / `limit` for the reaction list on a story.
 *
 * `Number(limit) || 20` accepted `999999999` and — because `Number('-5')` is truthy — `-5` as
 * well, which reached Postgres as `LIMIT must not be negative` and came back through
 * `AllExceptionsFilter` as a 500 rather than a 400. The ceiling and the integer check copy the
 * pattern already used by `SearchFiltersDto` and `NotificationQueryDto`.
 */
export class ReactionPageQueryDto {
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
