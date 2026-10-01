import { Injectable, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { sql, eq, and } from 'drizzle-orm';

import { PasswordHasher } from '../../common/utils/password.util.ts';
import { AccountType } from '../../common/constants/roles.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import type { IUsersRepository } from '../../common/users/users-repository.interface.ts';
import { USERS_REPOSITORY } from '../../common/users/users-repository.interface.ts';
import { db } from '../../db/index.ts';
import { stories } from '../../db/schema/stories.schema.ts';
import { follows } from '../../db/schema/social.schema.ts';
import { reactions } from '../../db/schema/social.schema.ts';

import { UserStatsDto } from './dto/users.dto.ts';
import type { ClientUser, CreateUserInput, PublicUserProfile, UpdateUserInput, User } from './types.ts';
import { revivePublicUserProfileDates, reviveUserDates, toClientUser, toPublicUserProfile } from './types.ts';

export const USER_CACHE_NAMESPACE = 'user';
export const USER_PUBLIC_CACHE_NAMESPACE = 'user-public';
export const USERS_CACHE_TAG = 'users';
export const USER_CACHE_TTL_SECONDS = 300;
export const USER_STATS_CACHE_PREFIX = 'user:stats:';
export const USER_STATS_CACHE_TTL_SECONDS = 120;

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    @Inject(PasswordHasher) private readonly passwordHasher: PasswordHasher,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(TaggedCacheService) private readonly cache: TaggedCacheService,
  ) {}

  /**
   * Reads a user for an authenticated caller (`GET /users/me`), cached.
   *
   * Two defects lived here. The cached copy was `JSON.parse`d by hand, so on a hit the `Date`
   * fields arrived as ISO strings inside a value typed `Date` — a type lie that only becomes a
   * `TypeError` later, and never on the first, cold request. And `passwordHash` was removed by
   * mutating the parsed object, which is a deny-list: it works until somebody adds a second
   * credential column.
   *
   * Both are replaced by the tagged cache plus {@link reviveUserDates} and {@link toClientUser}, so
   * the warm and cold paths are the same object and the shape is an allow-list.
   */
  async findById(id: string): Promise<ClientUser> {
    const { value } = await this.cache.getOrSet<ClientUser>({
      namespace: USER_CACHE_NAMESPACE,
      key: id,
      ttl: USER_CACHE_TTL_SECONDS,
      tags: [USERS_CACHE_TAG],
      revive: reviveUserDates,
      load: async () => {
        const user = await this.usersRepository.findById(id);
        if (!user || user.deletedAt) {
          throw new NotFoundException('User not found');
        }
        return toClientUser(user);
      },
    });
    return value;
  }

  /**
   * Reads the profile another client is allowed to see (`GET /users/:id`), cached.
   *
   * `accountType` is normalized by {@link toPublicUserProfile} *before* the value is cached, not on
   * the way out, so a legacy row cannot be written into the cache and then served for the whole TTL.
   * `createdAt` is revived on the way back in; the client types it as an ISO string, which is what
   * JSON serialization of a `Date` produces anyway, but an internal caller that reaches for
   * `.toISOString()` would otherwise be holding a bare string in a value typed `Date`.
   */
  async findPublicProfile(id: string): Promise<PublicUserProfile> {
    const { value } = await this.cache.getOrSet<PublicUserProfile>({
      namespace: USER_PUBLIC_CACHE_NAMESPACE,
      key: id,
      ttl: USER_CACHE_TTL_SECONDS,
      // Both user keys are tagged `users`, so a profile edit can retire them together. They used to
      // be independent `del`s and the public one was not deleted on update at all, which served the
      // pre-edit name and bio for five minutes after every save (Principle #11).
      tags: [USERS_CACHE_TAG],
      revive: revivePublicUserProfileDates,
      load: async () => {
        const user = await this.usersRepository.findById(id);
        if (!user || user.deletedAt) {
          throw new NotFoundException('User not found');
        }
        return toPublicUserProfile(user);
      },
    });
    return value;
  }

  /**
   * The lookup family below returns the repository row, credentials and all, on purpose: they are
   * identity lookups for sign-in and uniqueness checks, they are not reachable from any controller,
   * and a login path must be able to compare a password hash.
   *
   * The moment a route is added on top of one of them, the value has to go through
   * {@link toClientUser} first — that is the only place the credential columns are dropped.
   */

  async findByEmail(email: string): Promise<User> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByUsername(username: string): Promise<User> {
    const user = await this.usersRepository.findByUsername(username);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async create(input: CreateUserInput): Promise<ClientUser> {
    const existingEmail = await this.usersRepository.findByEmail(input.email).catch(() => null);
    if (existingEmail && !existingEmail.deletedAt) {
      throw new ConflictException('Email already exists');
    }

    const existingUsername = await this.usersRepository.findByUsername(input.username).catch(() => null);
    if (existingUsername && !existingUsername.deletedAt) {
      throw new ConflictException('Username already exists');
    }

    if (input.password) {
      input.passwordHash = await this.passwordHasher.hash(input.password);
    }

    const data: CreateUserInput = {
      email: input.email,
      username: input.username,
      name: input.name,
      passwordHash: input.passwordHash ?? null,
      accountType: input.accountType ?? AccountType.READER,
      googleId: input.googleId ?? null,
      facebookId: input.facebookId ?? null,
      twitterId: input.twitterId ?? null,
      githubId: input.githubId ?? null,
      appleId: input.appleId ?? null,
      tiktokId: input.tiktokId ?? null,
    };

    const user = await this.usersRepository.create(data);
    // A freshly inserted row has a password hash the caller must never see, so the created user
    // leaves through the same mapper as every other user-shaped response.
    return toClientUser(user);
  }

  /**
   * Applies a profile update and returns the stored user.
   *
   * `UsersRepository.update` returns the whole `users` row, because the repository interface is
   * shared with the auth flows that do need the credentials. This service is the boundary, so the
   * row is mapped here: before this, `PATCH /users/me` and `PATCH /users/:id` serialized
   * `passwordHash` and `emailVerificationToken` to the browser, and the only reason no one noticed
   * is that the client's Zod schema happens to strip unknown keys — a defence in the wrong layer,
   * since the secret left the process before any client could drop it.
   *
   * Both cache keys are invalidated together. Dropping only `user:<id>` used to leave the public
   * profile serving the pre-edit name and bio for the full TTL (Principle #11).
   */
  async update(id: string, input: UpdateUserInput): Promise<ClientUser> {
    if (input.email) {
      const existing = await this.usersRepository.findByEmail(input.email).catch(() => null);
      if (existing && existing.id !== id && !existing.deletedAt) {
        throw new ConflictException('Email already exists');
      }
    }

    if (input.username) {
      const existing = await this.usersRepository.findByUsername(input.username).catch(() => null);
      if (existing && existing.id !== id && !existing.deletedAt) {
        throw new ConflictException('Username already exists');
      }
    }

    const updatePayload: UpdateUserInput = { ...input };

    if (input.password) {
      updatePayload.passwordHash = await this.passwordHasher.hash(input.password);
      delete updatePayload.password;
    }

    const user = await this.usersRepository.update(id, updatePayload);
    await this.invalidateUserCache(id);
    return toClientUser(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  async softDelete(id: string): Promise<void> {
    await this.usersRepository.softDelete(id);
    await this.invalidateUserCache(id);
  }

  async findByGoogleId(googleId: string): Promise<User> {
    const user = await this.usersRepository.findByGoogleId(googleId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByFacebookId(facebookId: string): Promise<User> {
    const user = await this.usersRepository.findByFacebookId(facebookId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByTwitterId(twitterId: string): Promise<User> {
    const user = await this.usersRepository.findByTwitterId(twitterId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByGithubId(githubId: string): Promise<User> {
    const user = await this.usersRepository.findByGithubId(githubId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByAppleId(appleId: string): Promise<User> {
    const user = await this.usersRepository.findByAppleId(appleId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByTiktokId(tiktokId: string): Promise<User> {
    const user = await this.usersRepository.findByTiktokId(tiktokId);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async getUserStats(id: string): Promise<UserStatsDto> {
    const cacheKey = `${USER_STATS_CACHE_PREFIX}${id}`;
    const cached = await this.valkeyService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as UserStatsDto;
    }

    const user = await this.usersRepository.findById(id);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    const [storiesResult, viewsResult, reactionsResult, followersResult, followingResult] = await Promise.all([
      db
        .select({ total: sql<number>`count(*)` })
        .from(stories)
        .where(and(eq(stories.authorId, id), sql`${stories.deletedAt} IS NULL`)),
      db
        .select({ total: sql<number>`sum(${stories.viewCount})` })
        .from(stories)
        .where(and(eq(stories.authorId, id), sql`${stories.deletedAt} IS NULL`)),
      db
        .select({ total: sql<number>`count(*)` })
        .from(reactions)
        .innerJoin(stories, eq(stories.id, reactions.storyId))
        .where(and(eq(stories.authorId, id), sql`${stories.deletedAt} IS NULL`)),
      db
        .select({ total: sql<number>`count(*)` })
        .from(follows)
        .where(eq(follows.followingId, id)),
      db
        .select({ total: sql<number>`count(*)` })
        .from(follows)
        .where(eq(follows.followerId, id)),
    ]);

    const stats: UserStatsDto = {
      storiesCount: Number(storiesResult[0]?.total ?? 0),
      totalViews: Number(viewsResult[0]?.total ?? 0),
      totalReactions: Number(reactionsResult[0]?.total ?? 0),
      followersCount: Number(followersResult[0]?.total ?? 0),
      followingCount: Number(followingResult[0]?.total ?? 0),
    };

    await this.valkeyService.set(cacheKey, JSON.stringify(stats), USER_STATS_CACHE_TTL_SECONDS);
    return stats;
  }

  /**
   * Retires every cached projection of one user: the authenticated user and the public profile.
   *
   * Both drops are targeted rather than one `invalidateTags(['users'])` sweep. A profile edit
   * invalidating every cached user in the deployment is the same defect stories hit when a single
   * page view swept the whole story cache: the hit rate collapses while the price stays the same.
   * Each key is dropped together with its tag index entry, and the generation bump makes the drop
   * visible to readers that loaded the user before the edit.
   *
   * A user has exactly two projections, and both are enumerated here, so there is no third key that
   * can be forgotten. The stats aggregate is deliberately *not* in this list: it is a derived
   * counter that changes when the user publishes or someone reacts, not when the profile is edited,
   * so it keeps its own short TTL and key outside the entity cache.
   */
  private async invalidateUserCache(id: string): Promise<void> {
    await this.cache.invalidateKey(USER_CACHE_NAMESPACE, id, [USERS_CACHE_TAG]);
    await this.cache.invalidateKey(USER_PUBLIC_CACHE_NAMESPACE, id, [USERS_CACHE_TAG]);
  }
}
