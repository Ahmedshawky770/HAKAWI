import { symbol } from '../../common/utils/symbol.util.js';
import type { User } from '../../../db/schema/users.schema.js';
import type { NewUser } from '../../../db/schema/users.schema.js';

export const USERS_REPOSITORY = symbol('USERS_REPOSITORY');

export type CreateUserInput = NewUser;
export type UpdateUserInput = Partial<CreateUserInput>;

export { User };

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
