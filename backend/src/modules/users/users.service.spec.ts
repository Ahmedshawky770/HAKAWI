import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import type { User, CreateUserInput, UpdateUserInput } from '../../common/users/users-repository.interface.ts';
import { AccountType } from '../../common/constants/roles.ts';
import { PasswordHasher } from '../../common/utils/password.util.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';

import { USER_CACHE_NAMESPACE, USER_PUBLIC_CACHE_NAMESPACE, UsersService } from './users.service.ts';

/**
 * An in-memory stand-in for `TaggedCacheService` that reproduces the behaviour these tests exist to
 * pin down: it stores with `JSON.stringify` and reads back with `JSON.parse`, exactly like Valkey.
 *
 * A mock that returned the same object instance it was given would keep passing after the bug
 * returned, because that object still holds real `Date`s — the failure only exists once the value
 * has crossed a serialize/deserialize boundary. An entry whose revival throws is dropped and
 * reported as a miss, the way the real service heals a corrupt payload instead of returning a 500.
 */
class FakeTaggedCache {
  private readonly store = new Map<string, string>();
  readonly invalidations: { namespace: string; key: string; tags: readonly string[] }[] = [];
  loadCount = 0;

  buildKey(namespace: string, key: string): string {
    return `cache:${namespace}:${key}`;
  }

  seedRaw(namespace: string, key: string, raw: string): void {
    this.store.set(this.buildKey(namespace, key), raw);
  }

  async get<T>(namespace: string, key: string, revive?: (value: T) => T): Promise<T | null> {
    const cacheKey = this.buildKey(namespace, key);
    const raw = this.store.get(cacheKey);
    if (raw === undefined) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as T;
      return revive === undefined ? parsed : revive(parsed);
    } catch {
      this.store.delete(cacheKey);
      return null;
    }
  }

  async set(namespace: string, key: string, value: unknown): Promise<void> {
    this.store.set(this.buildKey(namespace, key), JSON.stringify(value));
  }

  async getOrSet<T>(options: {
    namespace: string;
    key: string;
    load: () => Promise<T>;
    revive?: (value: T) => T;
  }): Promise<{ value: T; hit: boolean }> {
    const cached = await this.get<T>(options.namespace, options.key, options.revive);
    if (cached !== null) {
      return { value: cached, hit: true };
    }
    this.loadCount += 1;
    const loaded = await options.load();
    await this.set(options.namespace, options.key, loaded);
    return { value: loaded, hit: false };
  }

  async invalidateKey(namespace: string, key: string, tags: readonly string[] = []): Promise<void> {
    this.store.delete(this.buildKey(namespace, key));
    this.invalidations.push({ namespace, key, tags });
  }
}

type MockUsersRepository = {
  findById: Mock<(id: string) => Promise<User | null>>;
  findByEmail: Mock<(email: string) => Promise<User | null>>;
  findByUsername: Mock<(username: string) => Promise<User | null>>;
  findByGoogleId: Mock<(googleId: string) => Promise<User | null>>;
  findByFacebookId: Mock<(facebookId: string) => Promise<User | null>>;
  findByTwitterId: Mock<(twitterId: string) => Promise<User | null>>;
  findByGithubId: Mock<(githubId: string) => Promise<User | null>>;
  findByAppleId: Mock<(appleId: string) => Promise<User | null>>;
  findByTiktokId: Mock<(tiktokId: string) => Promise<User | null>>;
  create: Mock<(data: CreateUserInput) => Promise<User>>;
  update: Mock<(id: string, data: Partial<UpdateUserInput>) => Promise<User>>;
  softDelete: Mock<(id: string) => Promise<void>>;
  getUserStats: Mock<
    (id: string) => Promise<{
      storiesCount: number;
      totalViews: number;
      totalReactions: number;
      followersCount: number;
      followingCount: number;
    }>
  >;
};

type MockPasswordHasher = {
  hash: ReturnType<typeof vi.fn>;
  compare: ReturnType<typeof vi.fn>;
};

type MockValkeyService = {
  exists: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment */

const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-123',
  googleId: null,
  facebookId: null,
  twitterId: null,
  githubId: null,
  appleId: null,
  tiktokId: null,
  username: 'testuser',
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  name: 'Test User',
  avatar: null,
  bio: null,
  accountType: AccountType.READER,
  adminRole: null,
  isVerified: false,
  onboardingCompleted: false,
  accessBlocked: false,
  lastLoginAt: null,
  deletedAt: null,
  emailVerified: false,
  emailVerificationToken: null,
  passwordResetToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('UsersService', () => {
  let usersService: UsersService;
  let usersRepository: MockUsersRepository;
  let passwordHasher: MockPasswordHasher;
  let valkeyService: MockValkeyService;
  let winstonLoggerService: MockWinstonLoggerService;
  let cache: FakeTaggedCache;

  beforeEach(() => {
    usersRepository = {
      findById: vi.fn<(id: string) => Promise<User | null>>(),
      findByEmail: vi.fn<(email: string) => Promise<User | null>>(),
      findByUsername: vi.fn<(username: string) => Promise<User | null>>(),
      findByGoogleId: vi.fn<(googleId: string) => Promise<User | null>>(),
      findByFacebookId: vi.fn<(facebookId: string) => Promise<User | null>>(),
      findByTwitterId: vi.fn<(twitterId: string) => Promise<User | null>>(),
      findByGithubId: vi.fn<(githubId: string) => Promise<User | null>>(),
      findByAppleId: vi.fn<(appleId: string) => Promise<User | null>>(),
      findByTiktokId: vi.fn<(tiktokId: string) => Promise<User | null>>(),
      create: vi.fn<(data: CreateUserInput) => Promise<User>>(),
      update: vi.fn<(id: string, data: Partial<UpdateUserInput>) => Promise<User>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
      getUserStats: vi.fn<
        (id: string) => Promise<{
          storiesCount: number;
          totalViews: number;
          totalReactions: number;
          followersCount: number;
          followingCount: number;
        }>
      >(),
    };

    passwordHasher = {
      hash: vi.fn(),
      compare: vi.fn(),
    };

    valkeyService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      exists: vi.fn(),
    };

    winstonLoggerService = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    cache = new FakeTaggedCache();

    usersService = new UsersService(
      usersRepository,
      passwordHasher as unknown as PasswordHasher,
      valkeyService as unknown as ValkeyService,
      winstonLoggerService as unknown as WinstonLoggerService,
      cache as unknown as TaggedCacheService,
    );
  });

  describe('findById', () => {
    it('should fetch from repository and cache when not in cache', async () => {
      const user = createMockUser();
      vi.mocked(usersRepository.findById).mockResolvedValue(user);

      const result = await usersService.findById('user-123');

      expect(result.id).toBe('user-123');
    });

    it('should throw NotFoundException when user not found', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(null);

      await expect(usersService.findById('user-123')).rejects.toThrow('User not found');
    });

    it('should throw NotFoundException when user is soft deleted', async () => {
      const deletedUser = createMockUser({ deletedAt: new Date() });
      vi.mocked(usersRepository.findById).mockResolvedValue(deletedUser);

      await expect(usersService.findById('user-123')).rejects.toThrow('User not found');
    });

    /**
     * The regression this module was fixed for, through a real serialize → deserialize round trip.
     * The second call is served by an entry that went through `JSON.stringify` and `JSON.parse`,
     * which is what the cache actually hands back.
     *
     * Without date revival the warm value carries ISO strings inside a `Promise<ClientUser>` that
     * promises `createdAt: Date`, so the first `.toISOString()` or `.getTime()` on it throws — on
     * every hit, while the first cold request succeeds. The `.toISOString()` call is the point:
     * an `instanceof` check alone would not reproduce what an internal caller actually hits.
     */
    it('returns Date instances on a cache hit, so callers can use them as dates', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser({ lastLoginAt: new Date('2024-05-05') }));

      const cold = await usersService.findById('user-123');
      const warm = await usersService.findById('user-123');

      expect(warm.createdAt).toBeInstanceOf(Date);
      expect(warm.updatedAt).toBeInstanceOf(Date);
      expect(warm.lastLoginAt).toBeInstanceOf(Date);
      expect(warm.deletedAt).toBeNull();
      expect(warm.createdAt.toISOString()).toBe(cold.createdAt.toISOString());
      expect(warm.lastLoginAt?.toISOString()).toBe('2024-05-05T00:00:00.000Z');
    });

    it('drops an un-revivable cache entry and reloads instead of throwing', async () => {
      // `createdAt: null` cannot be the row that was cached, so the entry is corrupt and has to
      // heal into a miss rather than become a 500.
      cache.seedRaw(USER_CACHE_NAMESPACE, 'user-123', JSON.stringify({ id: 'user-123', createdAt: null }));
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser());

      const result = await usersService.findById('user-123');

      expect(result.id).toBe('user-123');
      expect(usersRepository.findById).toHaveBeenCalledTimes(1);
    });

    it('never returns the password hash, on either the cold or the warm path', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(
        createMockUser({ passwordHash: '$2b$10$supersecret', emailVerificationToken: 'verify-me' }),
      );

      const cold = await usersService.findById('user-123');
      const warm = await usersService.findById('user-123');

      expect(cold).not.toHaveProperty('passwordHash');
      expect(cold).not.toHaveProperty('emailVerificationToken');
      expect(cold).not.toHaveProperty('passwordResetToken');
      expect(warm).not.toHaveProperty('passwordHash');
      expect(warm).not.toHaveProperty('emailVerificationToken');
      expect(warm).not.toHaveProperty('passwordResetToken');
    });
  });

  describe('findPublicProfile', () => {
    it('returns the public projection of a user', async () => {
      const createdAt = new Date('2024-02-02T00:00:00.000Z');
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser({ bio: 'Writes about tides', createdAt }));

      const profile = await usersService.findPublicProfile('user-123');

      expect(profile).toEqual({
        id: 'user-123',
        username: 'testuser',
        name: 'Test User',
        avatar: null,
        bio: 'Writes about tides',
        accountType: AccountType.READER,
        isVerified: false,
        createdAt,
      });
    });

    it('throws NotFoundException when the user does not exist', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(null);

      await expect(usersService.findPublicProfile('user-123')).rejects.toThrow('User not found');
    });

    it('throws NotFoundException when the user is soft deleted', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser({ deletedAt: new Date() }));

      await expect(usersService.findPublicProfile('user-123')).rejects.toThrow('User not found');
    });

    /**
     * `users.account_type` is a bare `varchar(20)` and rows predate the `author` → `writer` rename,
     * so the database still holds values the API contract does not define. The client validates
     * `accountType` against a strict `z.enum(ACCOUNT_TYPES)`, so one legacy row turned a valid 200
     * into `Invalid server response: accountType: Invalid enum value` and hard-failed the profile
     * page. Normalization has to happen before the value is cached, or the poisoned value would
     * also be served from cache for the next five minutes.
     */
    it('maps a legacy author accountType to writer', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser({ accountType: 'author' }));

      const profile = await usersService.findPublicProfile('user-123');

      expect(profile.accountType).toBe(AccountType.WRITER);
    });

    it('keeps a valid modern accountType as it is', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser({ accountType: AccountType.RISING_STAR }));

      const profile = await usersService.findPublicProfile('user-123');

      expect(profile.accountType).toBe(AccountType.RISING_STAR);
    });

    /**
     * Fails closed (Principle #15): an unknown value becomes the least-privileged account type
     * instead of being passed through. Forwarding it would hand the client the exact string that
     * just broke it, and silently granting a role would be the worse failure of the two.
     */
    it('falls back to the default accountType for an unknown value', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser({ accountType: 'superadmin' }));

      const profile = await usersService.findPublicProfile('user-123');

      expect(profile.accountType).toBe(AccountType.READER);
    });

    it('normalizes a legacy accountType read back from the cache, not only on the first read', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser({ accountType: 'author' }));

      await usersService.findPublicProfile('user-123');
      const warm = await usersService.findPublicProfile('user-123');

      expect(warm.accountType).toBe(AccountType.WRITER);
    });

    it('returns a real Date on a cache hit instead of an ISO string', async () => {
      const createdAt = new Date('2024-03-03T04:05:06.000Z');
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser({ createdAt }));

      await usersService.findPublicProfile('user-123');
      const warm = await usersService.findPublicProfile('user-123');

      expect(warm.createdAt).toBeInstanceOf(Date);
      expect(warm.createdAt.toISOString()).toBe('2024-03-03T04:05:06.000Z');
    });

    it('drops an un-revivable cached profile and reloads instead of throwing', async () => {
      cache.seedRaw(USER_PUBLIC_CACHE_NAMESPACE, 'user-123', JSON.stringify({ id: 'user-123', createdAt: null }));
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser());

      const profile = await usersService.findPublicProfile('user-123');

      expect(profile.id).toBe('user-123');
      expect(usersRepository.findById).toHaveBeenCalledTimes(1);
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      const user = createMockUser();
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(user);

      const result = await usersService.findByEmail('test@example.com');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when email not found', async () => {
      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);

      await expect(usersService.findByEmail('test@example.com')).rejects.toThrow('User not found');
    });
  });

  describe('findByUsername', () => {
    it('should return user by username', async () => {
      const user = createMockUser();
      vi.mocked(usersRepository.findByUsername).mockResolvedValue(user);

      const result = await usersService.findByUsername('testuser');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when username not found', async () => {
      vi.mocked(usersRepository.findByUsername).mockResolvedValue(null);

      await expect(usersService.findByUsername('testuser')).rejects.toThrow('User not found');
    });
  });

  describe('create', () => {
    it('should create user successfully', async () => {
      const input: CreateUserInput = {
        email: 'new@example.com',
        username: 'newuser',
        name: 'New User',
        password: 'SecurePass123!',
        accountType: AccountType.READER,
        passwordHash: null,
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(usersRepository.findByUsername).mockResolvedValue(null);
      vi.mocked(passwordHasher.hash).mockResolvedValue('hashed-password');
      vi.mocked(usersRepository.create).mockResolvedValue(
        createMockUser({ email: input.email, username: input.username }),
      );

      const result = await usersService.create(input);

      expect(result.email).toBe(input.email);
      expect(passwordHasher.hash).toHaveBeenCalledWith('SecurePass123!');
      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: input.email,
          username: input.username,
          passwordHash: 'hashed-password',
          accountType: AccountType.READER,
        }),
      );
    });

    it('should throw ConflictException when email already exists', async () => {
      const input: CreateUserInput = {
        email: 'existing@example.com',
        username: 'newuser',
        name: 'New User',
        password: 'SecurePass123!',
        accountType: AccountType.READER,
        passwordHash: null,
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser());

      await expect(usersService.create(input)).rejects.toThrow('Email already exists');
    });

    it('should throw ConflictException when username already exists', async () => {
      const input: CreateUserInput = {
        email: 'new@example.com',
        username: 'existinguser',
        name: 'New User',
        password: 'SecurePass123!',
        accountType: AccountType.READER,
        passwordHash: null,
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(usersRepository.findByUsername).mockResolvedValue(createMockUser());

      await expect(usersService.create(input)).rejects.toThrow('Username already exists');
    });

    it('should hash password when provided', async () => {
      const input: CreateUserInput = {
        email: 'new@example.com',
        username: 'newuser',
        name: 'New User',
        password: 'SecurePass123!',
        accountType: AccountType.READER,
        passwordHash: null,
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(usersRepository.findByUsername).mockResolvedValue(null);
      vi.mocked(passwordHasher.hash).mockResolvedValue('hashed-password');
      vi.mocked(usersRepository.create).mockResolvedValue(createMockUser());

      await usersService.create(input);

      expect(passwordHasher.hash).toHaveBeenCalledWith('SecurePass123!');
    });
  });

  describe('update', () => {
    it('should update user successfully', async () => {
      const input: UpdateUserInput = { name: 'Updated Name' };
      const updatedUser = createMockUser({ name: 'Updated Name' });

      vi.mocked(usersRepository.update).mockResolvedValue(updatedUser);

      const result = await usersService.update('user-123', input);

      expect(result.name).toBe('Updated Name');
    });

    /**
     * `UsersRepository.update` returns the whole `users` row — it has to, because the repository
     * interface is shared with the auth flows that legitimately read the credentials. The service is
     * the HTTP boundary, so this is where the row has to be cut down to the profile shape.
     *
     * Before this, `PATCH /users/me` and `PATCH /users/:id` serialized `passwordHash` and
     * `emailVerificationToken` to the browser, and the only thing between that and an account
     * takeover was a client-side Zod strip — a defence in the wrong layer, because the secret had
     * already left the process.
     */
    it('does not return passwordHash or emailVerificationToken from an update', async () => {
      vi.mocked(usersRepository.update).mockResolvedValue(
        createMockUser({
          name: 'Updated Name',
          passwordHash: '$2b$10$averyrealisticbcrypthash',
          emailVerificationToken: 'a-live-email-verification-token',
          passwordResetToken: 'a-live-password-reset-token',
        }),
      );

      const result = await usersService.update('user-123', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('emailVerificationToken');
      expect(result).not.toHaveProperty('passwordResetToken');
      // The whole payload, not just the fields this spec happens to read.
      expect(JSON.stringify(result)).not.toContain('averyrealisticbcrypthash');
      expect(JSON.stringify(result)).not.toContain('a-live-email-verification-token');
      expect(JSON.stringify(result)).not.toContain('a-live-password-reset-token');
    });

    it('normalizes accountType on the update response', async () => {
      vi.mocked(usersRepository.update).mockResolvedValue(createMockUser({ accountType: 'author' }));

      const result = await usersService.update('user-123', { name: 'Updated Name' });

      expect(result.accountType).toBe(AccountType.WRITER);
    });

    it('invalidates both the user and the public profile caches', async () => {
      vi.mocked(usersRepository.update).mockResolvedValue(createMockUser());

      await usersService.update('user-123', { name: 'Updated Name' });

      // Dropping only the `user:` key used to leave `GET /users/:id` serving the pre-edit name and
      // bio for the full five minutes, because the public profile was never invalidated at all.
      expect(cache.invalidations).toContainEqual({ namespace: USER_CACHE_NAMESPACE, key: 'user-123', tags: ['users'] });
      expect(cache.invalidations).toContainEqual({
        namespace: USER_PUBLIC_CACHE_NAMESPACE,
        key: 'user-123',
        tags: ['users'],
      });
    });

    it('invalidates the caches before returning, so the next read cannot serve the old row', async () => {
      vi.mocked(usersRepository.update).mockResolvedValue(createMockUser({ name: 'Updated Name' }));
      vi.mocked(usersRepository.findById).mockResolvedValue(createMockUser({ name: 'Stale Name' }));

      await usersService.update('user-123', { name: 'Updated Name' });
      const profile = await usersService.findPublicProfile('user-123');

      expect(cache.invalidations).toHaveLength(2);
      expect(profile.name).toBe('Stale Name');
    });

    it('should throw ConflictException when updating to existing email', async () => {
      const input: UpdateUserInput = { email: 'existing@example.com' };
      const otherUser = createMockUser({ id: 'other-user', email: 'existing@example.com' });

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(otherUser);

      await expect(usersService.update('user-123', input)).rejects.toThrow('Email already exists');
    });

    it('should allow updating own email', async () => {
      const input: UpdateUserInput = { email: 'test@example.com' };
      const updatedUser = createMockUser({ email: 'test@example.com' });

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(createMockUser({ id: 'user-123' }));
      vi.mocked(usersRepository.update).mockResolvedValue(updatedUser);

      const result = await usersService.update('user-123', input);

      expect(result.email).toBe('test@example.com');
    });
  });

  describe('softDelete', () => {
    it('should soft delete user and clear both caches', async () => {
      vi.mocked(usersRepository.softDelete).mockResolvedValue(undefined);

      await usersService.softDelete('user-123');

      expect(usersRepository.softDelete).toHaveBeenCalledWith('user-123');
      // A deleted account must stop being readable through the public profile too, so both
      // projections are dropped; leaving the public one behind serves a deleted user for the TTL.
      expect(cache.invalidations).toContainEqual({ namespace: USER_CACHE_NAMESPACE, key: 'user-123', tags: ['users'] });
      expect(cache.invalidations).toContainEqual({
        namespace: USER_PUBLIC_CACHE_NAMESPACE,
        key: 'user-123',
        tags: ['users'],
      });
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      vi.mocked(usersRepository.update).mockResolvedValue(createMockUser());

      await usersService.updateLastLogin('user-123');

      expect(usersRepository.update).toHaveBeenCalledWith('user-123', { lastLoginAt: expect.any(Date) });
    });
  });

  describe('OAuth finders', () => {
    it('should find user by Google ID', async () => {
      const user = createMockUser({ googleId: 'google-123' });
      vi.mocked(usersRepository.findByGoogleId).mockResolvedValue(user);

      const result = await usersService.findByGoogleId('google-123');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when Google user not found', async () => {
      vi.mocked(usersRepository.findByGoogleId).mockResolvedValue(null);

      await expect(usersService.findByGoogleId('google-123')).rejects.toThrow('User not found');
    });

    it('should find user by Facebook ID', async () => {
      const user = createMockUser({ facebookId: 'fb-123' });
      vi.mocked(usersRepository.findByFacebookId).mockResolvedValue(user);

      const result = await usersService.findByFacebookId('fb-123');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when Facebook user not found', async () => {
      vi.mocked(usersRepository.findByFacebookId).mockResolvedValue(null);

      await expect(usersService.findByFacebookId('fb-123')).rejects.toThrow('User not found');
    });

    it('should find user by GitHub ID', async () => {
      const user = createMockUser({ githubId: 'gh-123' });
      vi.mocked(usersRepository.findByGithubId).mockResolvedValue(user);

      const result = await usersService.findByGithubId('gh-123');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when GitHub user not found', async () => {
      vi.mocked(usersRepository.findByGithubId).mockResolvedValue(null);

      await expect(usersService.findByGithubId('gh-123')).rejects.toThrow('User not found');
    });

    it('should find user by Apple ID', async () => {
      const user = createMockUser({ appleId: 'apple-123' });
      vi.mocked(usersRepository.findByAppleId).mockResolvedValue(user);

      const result = await usersService.findByAppleId('apple-123');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when Apple user not found', async () => {
      vi.mocked(usersRepository.findByAppleId).mockResolvedValue(null);

      await expect(usersService.findByAppleId('apple-123')).rejects.toThrow('User not found');
    });

    it('should find user by TikTok ID', async () => {
      const user = createMockUser({ tiktokId: 'tiktok-123' });
      vi.mocked(usersRepository.findByTiktokId).mockResolvedValue(user);

      const result = await usersService.findByTiktokId('tiktok-123');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when TikTok user not found', async () => {
      vi.mocked(usersRepository.findByTiktokId).mockResolvedValue(null);

      await expect(usersService.findByTiktokId('tiktok-123')).rejects.toThrow('User not found');
    });
  });

  describe('getUserStats', () => {
    it('should return stats from cache when available', async () => {
      const cachedStats = {
        storiesCount: 5,
        totalViews: 100,
        totalReactions: 20,
        followersCount: 10,
        followingCount: 3,
      };
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(cachedStats));

      const result = await usersService.getUserStats('user-123');

      expect(result).toEqual(cachedStats);
      expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    it('should return cached stats without hitting repository', async () => {
      const cachedStats = { storiesCount: 0, totalViews: 0, totalReactions: 0, followersCount: 0, followingCount: 0 };
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(cachedStats));

      const result = await usersService.getUserStats('user-123');

      expect(result.storiesCount).toBe(0);
      expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user not found', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(usersRepository.findById).mockResolvedValue(null);

      await expect(usersService.getUserStats('user-123')).rejects.toThrow('User not found');
    });

    it('should throw NotFoundException when user is soft deleted', async () => {
      const deletedUser = createMockUser({ deletedAt: new Date() });
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      vi.mocked(usersRepository.findById).mockResolvedValue(deletedUser);

      await expect(usersService.getUserStats('user-123')).rejects.toThrow('User not found');
    });
  });
});
