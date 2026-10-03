import {
  IsString,
  IsOptional,
  IsUUID,
  IsIn,
  MaxLength,
  MinLength,
  IsDate,
  Min,
  Max,
  IsInt,
  Length,
} from 'class-validator';

export class CreateContestDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description must not exceed 2000 characters' })
  description?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @IsDate()
  startDate: Date;

  @IsDate()
  endDate: Date;

  @IsDate()
  submissionDeadline: Date;
}

export class UpdateContestDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Description must not exceed 2000 characters' })
  description?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  @IsOptional()
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsDate()
  submissionDeadline?: Date;

  @IsOptional()
  @IsIn(['draft', 'active', 'voting', 'completed', 'cancelled'], {
    message: 'Status must be one of: draft, active, voting, completed, cancelled',
  })
  status?: string;
}

export class ContestsQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

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

export class SubmitStoryDto {
  @IsUUID('4', { message: 'Story ID must be a valid UUID' })
  storyId: string;
}

export class CastVoteDto {
  @IsUUID('4', { message: 'Submission ID must be a valid UUID' })
  submissionId: string;
}

export class SelectWinnerDto {
  @IsUUID('4', { message: 'Submission ID must be a valid UUID' })
  submissionId: string;

  @IsUUID('4', { message: 'Winner ID must be a valid UUID' })
  winnerId: string;
}

export class DistributePrizeDto {
  @IsUUID('4', { message: 'Submission ID must be a valid UUID' })
  submissionId: string;

  @IsUUID('4', { message: 'Winner ID must be a valid UUID' })
  winnerId: string;

  @IsString()
  @MaxLength(50, { message: 'Prize type must not exceed 50 characters' })
  prizeType: string;

  /**
   * The prize value in PIASTRES (1 EGP = 100), with `currency` beside it.
   *
   * There was no amount at all: a prize was `prizeType` plus a prose `prizeDescription`, so a cash
   * prize had nowhere to go and no total was computable. Optional because a non-cash prize — a book,
   * a certificate — genuinely has no figure, and because every row written before migration 0022 has
   * none. What is enforced is that the two travel together, in the schema's CHECK.
   */
  @IsOptional()
  @IsInt({ message: 'Amount must be an integer number of piastres' })
  @Min(0, { message: 'Amount must not be negative' })
  amount?: number;

  /** ISO 4217, three characters. Required exactly when `amount` is present — see the schema CHECK. */
  @IsOptional()
  @IsString()
  @Length(3, 3, { message: 'Currency must be a 3-letter ISO 4217 code' })
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Prize description must not exceed 500 characters' })
  prizeDescription?: string;
}

export class ReviewSubmissionDto {
  @IsIn(['approved', 'rejected'], { message: 'Status must be either approved or rejected' })
  status: string;
}

/**
 * `page` / `limit` for the submission list and the vote list on a contest.
 *
 * `Number(limit) || 20` accepted `999999999` and — because `Number('-5')` is truthy — `-5` as
 * well, which reached Postgres as `LIMIT must not be negative` and came back through
 * `AllExceptionsFilter` as a 500 rather than a 400. The ceiling and the integer check copy the
 * pattern already used by `SearchFiltersDto` and `NotificationQueryDto`.
 */
export class ContestPageQueryDto {
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

/**
 * The vote list's query, which filters by `submissionId` as well as paginating.
 *
 * WHY IT EXTENDS `ContestPageQueryDto` RATHER THAN ADDING A SECOND PARAMETER. `@Query()` with no key
 * already yields the whole query object, so reading both keys from one validated parameter is both
 * shorter and the only form that typechecks: `submissionId?: string` followed by a required parameter
 * is `TS1016`, and splitting it back into `@Query('submissionId')` would reintroduce an unvalidated
 * key that the page DTO does not cover.
 *
 * `submissionId` is a bare string rather than `@IsUUID()`, matching what this route accepted before:
 * it is a filter, not a resource lookup, and an unparseable value yields an empty vote list rather than
 * a row the caller could not have meant.
 */
export class ContestVotesQuery extends ContestPageQueryDto {
  @IsOptional()
  @IsString({ message: 'Submission ID must be a string' })
  submissionId?: string;
}
