import { IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(255, { message: 'Password must not exceed 255 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain uppercase, lowercase, number, and special character',
  })
  password: string;

  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name: string;

  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(30, { message: 'Username must not exceed 30 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers, and underscores' })
  username: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @IsString()
  password: string;
}

export class RefreshTokenDto {
  // WHY optional: the browser holds the refresh token in an httpOnly cookie that JavaScript
  // cannot read, so the body is only the non-browser path. Making the field required would
  // turn every cookie-only refresh into a 400 from the global ValidationPipe before the
  // controller ever gets a chance to read the cookie (Principle #8: additive, not breaking).
  // AuthService still refuses a request that arrives with neither source.
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class AuthResponseDto {
  user: {
    id: string;
    email: string;
    name: string;
    username: string;
    accountType: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export class SessionResponseDto {
  user: {
    id: string;
    email: string;
    name: string;
    username: string;
    accountType: string;
  };
  expiresAt: string;
}

export class LogoutResponseDto {
  message: string;
}

export class OAuthTokensDto {
  accessToken: string;
  refreshToken: string;
}

export class OAuthUserInfoDto {
  id: string;
  email: string;
  name: string;
  username?: string;
  avatar?: string | null;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(255, { message: 'Password must not exceed 255 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain uppercase, lowercase, number, and special character',
  })
  password: string;
}
