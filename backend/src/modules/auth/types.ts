export type AuthResponseDto = {
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
};

export type SessionResponseDto = {
  user: {
    id: string;
    email: string;
    name: string;
    username: string;
    accountType: string;
  };
  expiresAt: string;
};

export type LoginDto = {
  email: string;
  password: string;
};

export type RegisterDto = {
  email: string;
  password: string;
  name: string;
  username: string;
};

export type RefreshTokenDto = {
  refreshToken: string;
};

export type OAuthProvider = 'google' | 'facebook' | 'github' | 'apple' | 'tiktok';

export type ForgotPasswordDto = {
  email: string;
};

export type ResetPasswordDto = {
  token: string;
  password: string;
};
