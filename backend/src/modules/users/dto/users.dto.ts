import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsBoolean, Matches, IsInt, Min } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name: string;

  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(30, { message: 'Username must not exceed 30 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers, and underscores' })
  username: string;

  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(255, { message: 'Password must not exceed 255 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain uppercase, lowercase, number, and special character',
  })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Avatar URL must not exceed 255 characters' })
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Bio must not exceed 500 characters' })
  bio?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Avatar URL must not exceed 255 characters' })
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Bio must not exceed 500 characters' })
  bio?: string;

  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;
}

export class UserResponseDto {
  id: string;
  username: string;
  email: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  accountType: string;
  isVerified: boolean;
  onboardingCompleted: boolean;
  accessBlocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class UserStatsDto {
  @IsInt()
  @Min(0)
  storiesCount: number;

  @IsInt()
  @Min(0)
  totalViews: number;

  @IsInt()
  @Min(0)
  totalReactions: number;

  @IsInt()
  @Min(0)
  followersCount: number;

  @IsInt()
  @Min(0)
  followingCount: number;
}

export class UserProfileResponseDto {
  id: string;
  username: string;
  email: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  accountType: string;
  isVerified: boolean;
  onboardingCompleted: boolean;
  accessBlocked: boolean;
  createdAt: Date;
  updatedAt: Date;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  socialLinks?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  age?: number;
}

export class VerifyResponseDto {
  message: string;
  user: {
    id: string;
    isVerified: boolean;
  };
}
