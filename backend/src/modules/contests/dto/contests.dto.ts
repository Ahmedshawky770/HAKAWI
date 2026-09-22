import { IsString, IsInt, IsOptional, MaxLength, MinLength, IsEnum, IsNumber, IsDateString, IsArray, IsBoolean, Min, IsObject } from 'class-validator';

export const ParticipantTypeValues = ['writer', 'professional', 'publisher'] as const;
export const PrizeTypeValues = ['cash', 'badge', 'recognition', 'publication'] as const;
export const ContestStatusValues = ['draft', 'published', 'active', 'voting', 'completed', 'cancelled'] as const;

export type ParticipantType = typeof ParticipantTypeValues[number];
export type PrizeType = typeof PrizeTypeValues[number];
export type ContestStatus = typeof ContestStatusValues[number];

export class CreateContestDto {
  @IsString()
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title: string;

  @IsString()
  @MinLength(1, { message: 'Description is required' })
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Theme must not exceed 255 characters' })
  theme?: string;

  @IsString()
  @MaxLength(100, { message: 'Category must not exceed 100 characters' })
  category: string;

  @IsEnum(ParticipantTypeValues, { message: 'Invalid participant type' })
  participantType: ParticipantType;

  @IsString()
  @IsDateString({}, { message: 'Invalid start date' })
  startDate: string;

  @IsString()
  @IsDateString({}, { message: 'Invalid end date' })
  endDate: string;

  @IsString()
  @IsDateString({}, { message: 'Invalid submission deadline' })
  submissionDeadline: string;

  @IsEnum(PrizeTypeValues, { message: 'Invalid prize type' })
  prizeType: PrizeType;

  @IsOptional()
  @IsNumber()
  prizeValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Prize description must not exceed 500 characters' })
  prizeDescription?: string;

  @IsOptional()
  @IsString()
  rules?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minWordCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWordCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedGenres?: string[];
}

export class UpdateContestDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Theme must not exceed 255 characters' })
  theme?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Category must not exceed 100 characters' })
  category?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid start date' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid end date' })
  endDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid submission deadline' })
  submissionDeadline?: string;

  @IsOptional()
  @IsEnum(PrizeTypeValues, { message: 'Invalid prize type' })
  prizeType?: PrizeType;

  @IsOptional()
  @IsNumber()
  prizeValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Prize description must not exceed 500 characters' })
  prizeDescription?: string;

  @IsOptional()
  @IsString()
  rules?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minWordCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWordCount?: number;

  @IsOptional()
  @IsEnum(ContestStatusValues, { message: 'Invalid contest status' })
  status?: ContestStatus;
}

export class ContestResponseDto {
  id: string;
  publisherId: string;
  title: string;
  description: string;
  theme: string;
  category: string;
  participantType: string;
  status: string;
  startDate: Date;
  endDate: Date;
  submissionDeadline: Date;
  prizeType: string;
  prizeValue: number;
  prizeDescription: string;
  rules: string;
  minWordCount: number;
  maxWordCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class ContestFiltersDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  participantType?: string;

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
  @IsString()
  sortOrder?: string;
}
