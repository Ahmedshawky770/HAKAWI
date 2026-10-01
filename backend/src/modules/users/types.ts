import { AccountType, normalizeAccountType } from '../../common/constants/roles.ts';
import { reviveNullableDate, reviveRequiredDate } from '../shared/cache/date-revival.ts';

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
  passwordResetToken: string | null;
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

export type UserStats = {
  storiesCount: number;
  totalViews: number;
  totalReactions: number;
  followersCount: number;
  followingCount: number;
};

/**
 * Columns that must never cross the HTTP boundary, whatever route produced them.
 *
 * `passwordHash` is a credential: returning it hands an attacker offline cracking material and
 * turns one read endpoint into a full account compromise. `emailVerificationToken` and
 * `passwordResetToken` are single-use bearer secrets — a leaked one is a free account takeover.
 * They live on the same row as the profile because that is how the table is normalised, not
 * because a profile needs them, so the stripping is a property of the *shape*, not of one mapper.
 */
type UserSecretColumn = 'passwordHash' | 'emailVerificationToken' | 'passwordResetToken';

/**
 * The one authoritative shape a user has when it is returned to a client.
 *
 * `UsersRepository.update` returns the whole `users` row — it has to, because the repository
 * interface is shared with the auth flows that legitimately need the credentials. Everything that
 * leaves the service therefore goes through {@link toClientUser}, so no route can accidentally
 * ship a column the profile does not have (Principle #9: one shape per entity).
 */
export type ClientUser = Omit<User, UserSecretColumn> & { accountType: AccountType };

/** The public profile of a user, as `GET /users/:id` returns it. */
export type PublicUserProfile = {
  id: string;
  username: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  accountType: AccountType;
  isVerified: boolean;
  createdAt: Date;
};

/**
 * Builds the client-facing user, dropping credentials and normalizing `accountType`.
 *
 * `users.account_type` is a plain `varchar(20)`, and rows predate the rename of `author` to
 * `writer`, so the database still holds values the API contract does not define. The client
 * validates `accountType` against a strict `z.enum(ACCOUNT_TYPES)`, which means one legacy row
 * turns a perfectly good 200 into `Invalid server response: accountType: Invalid enum value` and
 * hard-fails the page — the kind of bug that only shows up in production data, never in a seed.
 *
 * `normalizeAccountType` maps the known legacy spellings and **fails closed**: anything it does not
 * recognise becomes `DEFAULT_ACCOUNT_TYPE` (`reader`) rather than being passed through. Passing an
 * unknown value through would hand the client the exact string that just broke it; defaulting is
 * the least-privilege answer, and a reader is the weakest account type there is (Principle #15).
 */
export function toClientUser(user: User): ClientUser {
  return toUserFields(user, user.accountType);
}

export function toPublicUserProfile(user: User): PublicUserProfile {
  const base = toUserFields(user, user.accountType);
  return {
    id: base.id,
    username: base.username,
    name: base.name,
    avatar: base.avatar,
    bio: base.bio,
    accountType: base.accountType,
    isVerified: user.isVerified ?? false,
    createdAt: user.createdAt,
  };
}

/**
 * Restores the `Date` fields of a user that came back from the cache.
 *
 * A cache *hit* used to hand back `createdAt`/`updatedAt` as ISO strings inside an object typed
 * `Date`, so the signature lied and the first `.toISOString()`, `.getTime()` or date comparison
 * on it threw — while the first, cold request of every key worked. `TaggedCacheService.get` drops
 * an entry that cannot be revived and reports a miss, so this never turns into a 500.
 */
export function reviveUserDates(user: ClientUser): ClientUser {
  return {
    ...user,
    lastLoginAt: reviveNullableDate(user.lastLoginAt, 'lastLoginAt'),
    deletedAt: reviveNullableDate(user.deletedAt, 'deletedAt'),
    createdAt: reviveRequiredDate(user.createdAt, 'createdAt'),
    updatedAt: reviveRequiredDate(user.updatedAt, 'updatedAt'),
  };
}

/** The `PublicUserProfile` counterpart of {@link reviveUserDates}; `createdAt` is the only date. */
export function revivePublicUserProfileDates(profile: PublicUserProfile): PublicUserProfile {
  return {
    ...profile,
    createdAt: reviveRequiredDate(profile.createdAt, 'createdAt'),
  };
}

/**
 * The single place a user row becomes a client payload, so every route strips the same columns and
 * normalizes the same enum.
 *
 * This is an **allow-list**, not a deny-list, and the return type is `ClientUser` — so when a column
 * is added to `users`, the compiler refuses this function until someone decides whether the new
 * column may leave the process. A deny-list compiles happily and starts leaking. That is the
 * "never leak internals" half of Principle #15, and the reason the three credential columns are
 * absent here rather than deleted from a copy of the row.
 */
function toUserFields(user: User, rawAccountType: string): ClientUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    accountType: normalizeAccountType(rawAccountType),
    adminRole: user.adminRole,
    avatar: user.avatar,
    bio: user.bio,
    googleId: user.googleId,
    facebookId: user.facebookId,
    twitterId: user.twitterId,
    githubId: user.githubId,
    appleId: user.appleId,
    tiktokId: user.tiktokId,
    isVerified: user.isVerified,
    onboardingCompleted: user.onboardingCompleted,
    accessBlocked: user.accessBlocked,
    lastLoginAt: user.lastLoginAt,
    deletedAt: user.deletedAt,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
