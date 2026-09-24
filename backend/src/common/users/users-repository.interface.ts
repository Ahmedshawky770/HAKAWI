export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

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
  emailVerified: boolean;
  emailVerificationToken: string | null;
}>;

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
  emailVerified: boolean | null;
  emailVerificationToken: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface IUsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByGoogleId(googleId: string): Promise<User | null>;
  findByFacebookId(facebookId: string): Promise<User | null>;
  findByTwitterId(twitterId: string): Promise<User | null>;
  findByGithubId(githubId: string): Promise<User | null>;
  findByAppleId(appleId: string): Promise<User | null>;
  findByTiktokId(tiktokId: string): Promise<User | null>;
  create(data: CreateUserInput): Promise<User>;
  update(id: string, data: Partial<UpdateUserInput>): Promise<User>;
  softDelete(id: string): Promise<void>;
}
