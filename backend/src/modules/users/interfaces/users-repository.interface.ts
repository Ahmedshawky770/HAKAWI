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

export interface User {
  id: string;
  googleId: string | null;
  facebookId: string | null;
  twitterId: string | null;
  githubId: string | null;
  appleId: string | null;
  tiktokId: string | null;
  username: string;
  email: string;
  passwordHash: string | null;
  name: string;
  avatar: string | null;
  bio: string | null;
  accountType: string;
  adminRole: string | null;
  isVerified: boolean | null;
  onboardingCompleted: boolean | null;
  accessBlocked: boolean | null;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  googleId?: string;
  facebookId?: string;
  twitterId?: string;
  githubId?: string;
  appleId?: string;
  tiktokId?: string;
  username: string;
  email: string;
  passwordHash?: string;
  password?: string;
  name: string;
  avatar?: string;
  bio?: string;
  accountType: string;
  isVerified?: boolean;
  onboardingCompleted?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  username?: string;
  avatar?: string;
  bio?: string;
  accountType?: string;
  isVerified?: boolean;
  onboardingCompleted?: boolean;
  accessBlocked?: boolean;
  lastLoginAt?: Date;
}

export const USERS_REPOSITORY = 'USERS_REPOSITORY';
