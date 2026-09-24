import { IsUUID, IsOptional, IsInt, Min, Max } from 'class-validator';

export class FollowUserDto {
  @IsUUID('4', { message: 'Following user ID must be a valid UUID' })
  followingId: string;
}

export class FollowersQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'User ID must be a valid UUID' })
  userId?: string;

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
