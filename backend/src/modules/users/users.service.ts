import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { sql, eq, and, isNull, count } from 'drizzle-orm';

import { PasswordHasher } from '../../common/utils/password.util.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { ConfigService } from '@nestjs/config';
import { parseDurationToMs } from '../auth/auth.service.ts';
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

/**
 * Postgres SQLSTATE for `unique_violation`.
 *
 * WHY IT IS STILL NEEDED WITH THE PRE-CHECKS IN PLACE. `users_email_unique` and
 * `users_username_unique` (`migrations/0000_create_users_table.sql`) are UNCONDITIONAL, and the
 * pre-checks below now refuse every existing row — live or soft-deleted — so they mirror those
 * indexes. What the pre-checks cannot close is the race between that check and the INSERT, where a
 * concurrent registration claims the same address in the gap. That residual window is what this
 * guard covers: without it, `AllExceptionsFilter` would render the driver error as an opaque 500,
 * so a duplicate address would answer 500 when the correct answer is 409. It is the last line of
 * defence, not the first.
 */
const UNIQUE_VIOLATION_SQLSTATE = '23505';

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code === UNIQUE_VIOLATION_SQLSTATE;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    @Inject(PasswordHasher) private readonly passwordHasher: PasswordHasher,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(TaggedCacheService) private readonly cache: TaggedCacheService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    @Inject(ConfigService) private readonly configService: ConfigService,
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

  /**
   * Registers a new account, refusing any email or username that already has a row — live or
   * soft-deleted.
   *
   * WHY EXISTENCE IS THE TEST AND NOT `!existingEmail.deletedAt`: `users_email_unique` and
   * `users_username_unique` are ordinary UNIQUE indexes on the bare column (Principle #6 — no
   * partial, soft-delete-aware index was ever added), so a soft-deleted row pins its email and
   * username exactly as firmly as a live one. The previous `&& !existingEmail.deletedAt` guard let
   * a registration aimed at a soft-deleted account past the service, and the INSERT then lost to
   * the very index the guard was told to ignore — surfacing the driver error as an opaque 500 where
   * the honest answer is a 409. Reuse is therefore refused here, at the service boundary, with the
   * same message a colliding live account gets, so the caller is told only that the identity is
   * taken and never whether the holder was deleted.
   */
  async create(input: CreateUserInput): Promise<ClientUser> {
    const existingEmail = await this.usersRepository.findByEmail(input.email).catch(() => null);
    if (existingEmail !== null) {
      throw new ConflictException('Email already exists');
    }

    const existingUsername = await this.usersRepository.findByUsername(input.username).catch(() => null);
    if (existingUsername !== null) {
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

    let user;
    try {
      user = await this.usersRepository.create(data);
    } catch (error) {
      // Only 23505 becomes a 409. A connection failure or a missing table is a real fault and must
      // keep surfacing as a 500 — turning it into "email already exists" would tell the caller to
      // retry with a different address when the database is simply down.
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // The pre-checks above now refuse every existing row, so a unique violation here is a race:
      // a concurrent registration claimed the address between the check and this insert. The holder
      // is there, so the address is genuinely taken either way.
      const held = await this.usersRepository.findByEmail(input.email).catch(() => null);
      throw new ConflictException(held ? 'Email already exists' : 'Username already exists');
    }

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
    // Same boundary as `create`: a row that holds the email or username exists — live or
    // soft-deleted — so it is pinned by the UNIQUE index and therefore taken. The only row a caller
    // may keep is their own, which is why the test is "exists under a different id" rather than
    // "is not deleted"; skipping the deleted holder here produced the same 500-instead-of-409 on
    // this path (`PATCH /users/:id`).
    if (input.email) {
      const existing = await this.usersRepository.findByEmail(input.email).catch(() => null);
      if (existing !== null && existing.id !== id) {
        throw new ConflictException('Email already exists');
      }
    }

    if (input.username) {
      const existing = await this.usersRepository.findByUsername(input.username).catch(() => null);
      if (existing !== null && existing.id !== id) {
        throw new ConflictException('Username already exists');
      }
    }

    const updatePayload: UpdateUserInput = { ...input };

    if (input.password) {
      updatePayload.passwordHash = await this.passwordHasher.hash(input.password);
      delete updatePayload.password;
    }

    let user;
    try {
      user = await this.usersRepository.update(id, updatePayload);
    } catch (error) {
      // Same shape as `create`: the pre-checks refuse every other user's row, so a unique
      // violation here is a race against a concurrent edit. Only 23505 becomes a 409; anything else
      // keeps surfacing as the fault it is.
      if (!isUniqueViolation(error)) {
        throw error;
      }
      // Disambiguated by which field the caller actually sent, so the message names the right one.
      const heldByEmail =
        input.email !== undefined && (await this.usersRepository.findByEmail(input.email).catch(() => null)) !== null;
      throw new ConflictException(heldByEmail ? 'Email already exists' : 'Username already exists');
    }

    await this.invalidateUserCache(id);
    return toClientUser(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  /**
   * upgrades the caller's account (self-service). Only `writer` / `rising_star` are
   * self-upgradeable; `professional` / `publisher` require admin provisioning.
   * Requires a verified email. Revokes refresh tokens so new claims take effect.
   */
  async upgradeAccount(id: string, target: string, approvedByAdmin = false): Promise<ClientUser> {
    const user = await this.usersRepository.findById(id);
    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found');
    }

    if (user.accountType === target) {
      return toClientUser(user);
    }

    if (!user.emailVerified) {
      throw new BadRequestException('Email must be verified before upgrading');
    }

    if (target !== AccountType.WRITER && target !== AccountType.RISING_STAR && target !== AccountType.PROFESSIONAL) {
      throw new BadRequestException('Invalid upgrade target');
    }

    if (target === AccountType.PROFESSIONAL && !approvedByAdmin) {
      throw new BadRequestException('Professional upgrade requires verification officer approval');
    }

    if (target === AccountType.PROFESSIONAL) {
      const eligibility = await this.checkProfessionalEligibility(id);
      if (!eligibility.eligible) {
        throw new BadRequestException(`Not eligible for professional upgrade: ${eligibility.reasons.join(', ')}`);
      }
    }

    await this.usersRepository.update(id, { accountType: target });
    await this.revokeRefreshTokens(id);
    await this.invalidateUserCache(id);

    await this.eventBus.emit('user.upgraded', {
      userId: id,
      oldType: user.accountType,
      newType: target,
    });

    const updated = await this.usersRepository.findById(id);
    if (!updated) {
      throw new NotFoundException('User not found');
    }
    return toClientUser(updated);
  }

  /**
   * Checks whether a user meets the objective thresholds required for a professional upgrade.
   * All thresholds must be met; email must be verified.
   */
  async checkProfessionalEligibility(id: string): Promise<{ eligible: boolean; reasons: string[] }> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      return { eligible: false, reasons: ['User not found'] };
    }

    const reasons: string[] = [];

    if (!user.emailVerified) {
      reasons.push('Email must be verified');
    }

    const publishedStories = await this.countPublishedStories(id);
    if (publishedStories < 5) {
      reasons.push(`At least 5 published stories required (current: ${publishedStories})`);
    }

    const storyViews = await this.countStoryViews(id);
    if (storyViews < 1000) {
      reasons.push(`At least 1,000 story views required (current: ${storyViews})`);
    }

    const storyReactions = await this.countStoryReactions(id);
    if (storyReactions < 100) {
      reasons.push(`At least 100 story reactions required (current: ${storyReactions})`);
    }

    const followerCount = await this.countFollowers(id);
    if (followerCount < 50) {
      reasons.push(`At least 50 followers required (current: ${followerCount})`);
    }

    return { eligible: reasons.length === 0, reasons };
  }

  private async countPublishedStories(userId: string): Promise<number> {
    const [result] = await db
      .select({ total: count() })
      .from(stories)
      .where(and(eq(stories.authorId, userId), eq(stories.status, 'published'), isNull(stories.deletedAt)));
    return Number(result?.total ?? 0);
  }

  private async countStoryViews(userId: string): Promise<number> {
    const [result] = await db
      .select({ total: sql<number>`sum(${stories.viewCount})` })
      .from(stories)
      .where(and(eq(stories.authorId, userId), eq(stories.status, 'published'), isNull(stories.deletedAt)));
    return Number(result?.total ?? 0);
  }

  private async countStoryReactions(userId: string): Promise<number> {
    const [result] = await db
      .select({ total: count() })
      .from(reactions)
      .innerJoin(stories, eq(stories.id, reactions.storyId))
      .where(and(eq(stories.authorId, userId), eq(stories.status, 'published'), isNull(stories.deletedAt)));
    return Number(result?.total ?? 0);
  }

  private async countFollowers(userId: string): Promise<number> {
    const [result] = await db.select({ total: count() }).from(follows).where(eq(follows.followingId, userId));
    return Number(result?.total ?? 0);
  }

  /**
   * Revokes every refresh token for one user so the new accountType claims take effect.
   */
  private async revokeRefreshTokens(userId: string): Promise<void> {
    const configured = this.configService.get<string>('jwt.refreshExpiry', '7d');
    const ttlMs = parseDurationToMs(configured) ?? 604_800_000;
    await this.valkeyService.set(
      `refresh_token:blacklist:user:${userId}`,
      'revoked',
      Math.ceil(ttlMs / 1000),
    );
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
