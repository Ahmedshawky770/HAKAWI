import { IsString, IsOptional, IsUUID, IsIn, MaxLength, MinLength, IsBoolean, IsDate, Min, Max, IsArray, IsInt } from 'class-validator';

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
  @IsIn(['draft', 'active', 'voting', 'completed', 'cancelled'], { message: 'Status must be one of: draft, active, voting, completed, cancelled' })
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

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Prize description must not exceed 500 characters' })
  prizeDescription?: string;
}

export class ReviewSubmissionDto {
  @IsIn(['approved', 'rejected'], { message: 'Status must be either approved or rejected' })
  status: string;
}
