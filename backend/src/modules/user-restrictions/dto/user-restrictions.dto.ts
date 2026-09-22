import { IsString, IsEnum, MaxLength, IsOptional, IsDateString } from 'class-validator';

export const RestrictionTypeValues = ['temporary_ban', 'permanent_ban', 'content_restriction', 'rate_limit'] as const;

export type RestrictionType = typeof RestrictionTypeValues[number];

export class CreateUserRestrictionDto {
  @IsString()
  userId: string;

  @IsEnum(RestrictionTypeValues, { message: 'Invalid restriction type' })
  restrictionType: RestrictionType;

  @IsString()
  @MaxLength(500, { message: 'Reason must not exceed 500 characters' })
  reason: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid expiration date' })
  expiresAt?: string;
}

export class UserRestrictionResponseDto {
  id: string;
  userId: string;
  restrictionType: string;
  reason: string;
  expiresAt: Date;
  createdBy: string;
  createdAt: Date;
}
