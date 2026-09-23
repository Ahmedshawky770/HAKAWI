export type User = {
  id: string;
  email: string;
  username: string;
  name: string;
  passwordHash: string | null;
  accountType: string;
  adminRole: string | null;
  avatar: string | null;
  bio: string | null;
  googleId: string | null;
  facebookId: string | null;
  twitterId: string | null;
  githubId: string | null;
  appleId: string | null;
  tiktokId: string | null;
  isVerified: boolean | null;
  onboardingCompleted: boolean | null;
  accessBlocked: boolean | null;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserInput = {
  id?: string;
  email: string;
  username: string;
  name: string;
  password?: string;
  passwordHash: string | null;
  accountType: string;
  googleId?: string | null;
  facebookId?: string | null;
  twitterId?: string | null;
  githubId?: string | null;
  appleId?: string | null;
  tiktokId?: string | null;
};

export type UpdateUserInput = Partial<{
  name: string;
  email: string;
  username: string;
  avatar: string | null;
  bio: string | null;
  password: string;
  passwordHash: string;
  isVerified: boolean;
  onboardingCompleted: boolean;
  accessBlocked: boolean;
  lastLoginAt: Date;
}>;
