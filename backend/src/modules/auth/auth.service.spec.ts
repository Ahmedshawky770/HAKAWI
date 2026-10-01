import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { PasswordHasher } from '../../common/utils/password.util.ts';
import { JwtHelper, JwtPayload, AppleJwksService, fingerprintToken } from '../../common/utils/jwt.util.ts';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../common/utils/encryption.util.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { CircuitBreakerService } from '../../common/resilience/circuit-breaker.service.ts';
import { AccountType } from '../../common/constants/roles.ts';
import type {
  IUsersRepository,
  User,
  CreateUserInput,
  UpdateUserInput,
} from '../users/interfaces/users-repository.interface.ts';
import { EmailVerificationService } from '../email-verification/email-verification.service.ts';

import { AuthService } from './auth.service.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

function oauthResponse(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function refreshableUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    name: 'Test User',
    accountType: AccountType.READER,
    passwordHash: 'hashed-password',
    adminRole: null,
    avatar: null,
    bio: null,
    googleId: null,
    facebookId: null,
    twitterId: null,
    githubId: null,
    appleId: null,
    tiktokId: null,
    isVerified: false,
    onboardingCompleted: false,
    accessBlocked: false,
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

type MockUsersRepository = {
  findById: ReturnType<typeof vi.fn>;
  findByEmail: ReturnType<typeof vi.fn>;
  findByUsername: ReturnType<typeof vi.fn>;
  findByGoogleId: ReturnType<typeof vi.fn>;
  findByFacebookId: ReturnType<typeof vi.fn>;
  findByTwitterId: ReturnType<typeof vi.fn>;
  findByGithubId: ReturnType<typeof vi.fn>;
  findByAppleId: ReturnType<typeof vi.fn>;
  findByTiktokId: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  softDelete: ReturnType<typeof vi.fn>;
};

type MockPasswordHasher = {
  hash: ReturnType<typeof vi.fn>;
  compare: ReturnType<typeof vi.fn>;
};

type MockJwtHelper = {
  generateAccessToken: ReturnType<typeof vi.fn>;
  generateRefreshToken: ReturnType<typeof vi.fn>;
  verifyRefreshToken: ReturnType<typeof vi.fn>;
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

type MockEventValidatorService = {
  emit: ReturnType<typeof vi.fn>;
  validateEvent: ReturnType<typeof vi.fn>;
};

type MockEmailVerificationService = {
  generateToken: ReturnType<typeof vi.fn>;
};

type MockEncryptionService = {
  encrypt: ReturnType<typeof vi.fn>;
  decrypt: ReturnType<typeof vi.fn>;
};

type MockCircuitBreakerService = {
  execute: ReturnType<typeof vi.fn>;
};

describe('AuthService', () => {
  let authService: AuthService;
  let usersRepository: MockUsersRepository;
  let passwordHasher: MockPasswordHasher;
  let jwtHelper: MockJwtHelper;
  let valkeyService: MockValkeyService;
  let winstonLoggerService: MockWinstonLoggerService;
  let eventValidatorService: MockEventValidatorService;
  let emailVerificationService: MockEmailVerificationService;
  let encryptionService: MockEncryptionService;
  let circuitBreaker: MockCircuitBreakerService;
  let appleJwks: { resolveKey: ReturnType<typeof vi.fn>; keys: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    usersRepository = {
      findById: vi.fn<(id: string) => Promise<User | null>>(),
      findByEmail: vi.fn<(email: string) => Promise<User | null>>(),
      findByUsername: vi.fn<(username: string) => Promise<User | null>>(),
      create: vi.fn<(data: CreateUserInput) => Promise<User>>(),
      update: vi.fn<(id: string, data: Partial<UpdateUserInput>) => Promise<User>>(),
      findByGoogleId: vi.fn<(googleId: string) => Promise<User | null>>(),
      findByFacebookId: vi.fn<(facebookId: string) => Promise<User | null>>(),
      findByTwitterId: vi.fn<(twitterId: string) => Promise<User | null>>(),
      findByGithubId: vi.fn<(githubId: string) => Promise<User | null>>(),
      findByAppleId: vi.fn<(appleId: string) => Promise<User | null>>(),
      findByTiktokId: vi.fn<(tiktokId: string) => Promise<User | null>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
    };

    passwordHasher = {
      hash: vi.fn(),
      compare: vi.fn(),
    };

    jwtHelper = {
      generateAccessToken: vi.fn(),
      generateRefreshToken: vi.fn(),
      verifyRefreshToken: vi.fn(),
    };

    valkeyService = {
      exists: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
    };

    winstonLoggerService = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    eventValidatorService = {
      emit: vi.fn(),
      validateEvent: vi.fn(),
    };

    emailVerificationService = {
      generateToken: vi.fn().mockResolvedValue('12345678'),
    };

    encryptionService = {
      encrypt: vi.fn().mockImplementation((token: string) => `encrypted_${token}`),
      decrypt: vi.fn().mockImplementation((token: string) => token.replace('encrypted_', '')),
    };

    circuitBreaker = {
      execute: vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
    };

    appleJwks = {
      resolveKey: vi.fn().mockResolvedValue(null),
      keys: vi.fn().mockResolvedValue(new Map()),
    };

    configService = {
      get: vi.fn((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          'jwt.refreshExpiry': '7d',
          'jwt.expiry': '15m',
          'apple.clientId': 'com.hakawi.web',
        };
        return values[key] ?? fallback;
      }),
    };

    authService = new AuthService(
      usersRepository as unknown as IUsersRepository,
      passwordHasher as unknown as PasswordHasher,
      jwtHelper as unknown as JwtHelper,
      valkeyService as unknown as ValkeyService,
      winstonLoggerService as unknown as WinstonLoggerService,
      circuitBreaker as unknown as CircuitBreakerService,
      eventValidatorService as unknown as EventValidatorService,
      emailVerificationService as unknown as EmailVerificationService,
      encryptionService as unknown as EncryptionService,
      appleJwks as unknown as AppleJwksService,
      configService as unknown as ConfigService,
    );
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        username: 'testuser',
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(usersRepository.findByUsername).mockResolvedValue(null);
      vi.mocked(passwordHasher.hash).mockResolvedValue('hashed-password');
      vi.mocked(usersRepository.create).mockResolvedValue({
        id: 'user-123',
        email: registerDto.email,
        username: registerDto.username,
        name: registerDto.name,
        accountType: AccountType.READER,
        passwordHash: 'hashed-password',
        googleId: null,
        facebookId: null,
        twitterId: null,
        githubId: null,
        appleId: null,
        tiktokId: null,
        avatar: null,
        bio: null,
        adminRole: null,
        isVerified: false,
        onboardingCompleted: false,
        accessBlocked: false,
        lastLoginAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User);
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('refresh-token');

      const result = await authService.register(registerDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(registerDto.email);
      expect(result.user.username).toBe(registerDto.username);
      expect(result.tokens.accessToken).toBe('access-token');
      expect(result.tokens.refreshToken).toBe('refresh-token');
      expect(passwordHasher.hash).toHaveBeenCalledWith(registerDto.password);
      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          username: registerDto.username,
          passwordHash: 'hashed-password',
          accountType: AccountType.READER,
        }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('user.registered', expect.any(Object));
    });

    it('should throw ConflictException when email already exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        username: 'testuser',
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue({
        id: 'existing-user',
        email: registerDto.email,
        username: 'existinguser',
        name: 'Existing User',
        passwordHash: null,
        accountType: AccountType.READER,
        adminRole: null,
        avatar: null,
        bio: null,
        googleId: null,
        facebookId: null,
        twitterId: null,
        githubId: null,
        appleId: null,
        tiktokId: null,
        isVerified: false,
        onboardingCompleted: false,
        accessBlocked: false,
        lastLoginAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User);

      await expect(authService.register(registerDto)).rejects.toThrow('Email already exists');
    });

    it('should throw ConflictException when username already exists', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        username: 'existinguser',
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(usersRepository.findByUsername).mockResolvedValue({
        id: 'existing-user',
        email: 'existing@example.com',
        username: registerDto.username,
        name: 'Existing User',
        passwordHash: null,
        accountType: AccountType.READER,
        adminRole: null,
        avatar: null,
        bio: null,
        googleId: null,
        facebookId: null,
        twitterId: null,
        githubId: null,
        appleId: null,
        tiktokId: null,
        isVerified: false,
        onboardingCompleted: false,
        accessBlocked: false,
        lastLoginAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User);

      await expect(authService.register(registerDto)).rejects.toThrow('Username already exists');
    });

    it('should propagate repository error when checking email', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        username: 'testuser',
      };

      vi.mocked(usersRepository.findByEmail).mockRejectedValue(new Error('DB error'));

      await expect(authService.register(registerDto)).rejects.toThrow('DB error');
    });

    it('should propagate repository error when checking username', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        username: 'testuser',
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(usersRepository.findByUsername).mockRejectedValue(new Error('DB error'));

      await expect(authService.register(registerDto)).rejects.toThrow('DB error');
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'SecurePass123!',
      };

      const user = {
        id: 'user-123',
        email: loginDto.email,
        passwordHash: 'hashed-password',
        accountType: AccountType.READER,
        username: 'testuser',
        name: 'Test User',
        adminRole: null,
        avatar: null,
        bio: null,
        googleId: null,
        facebookId: null,
        twitterId: null,
        githubId: null,
        appleId: null,
        tiktokId: null,
        isVerified: false,
        onboardingCompleted: false,
        accessBlocked: false,
        lastLoginAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(user);
      vi.mocked(passwordHasher.compare).mockResolvedValue(true);
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('refresh-token');

      const result = await authService.login(loginDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(loginDto.email);
      expect(passwordHasher.compare).toHaveBeenCalledWith(loginDto.password, 'hashed-password');
    });

    it('should throw UnauthorizedException with invalid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'WrongPassword123!',
      };

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(null);

      await expect(authService.login(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException when account is blocked', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'SecurePass123!',
      };

      const user = {
        id: 'user-123',
        email: loginDto.email,
        passwordHash: 'hashed-password',
        accountType: AccountType.READER,
        username: 'testuser',
        name: 'Test User',
        adminRole: null,
        avatar: null,
        bio: null,
        googleId: null,
        facebookId: null,
        twitterId: null,
        githubId: null,
        appleId: null,
        tiktokId: null,
        isVerified: false,
        onboardingCompleted: false,
        accessBlocked: true,
        lastLoginAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      vi.mocked(usersRepository.findByEmail).mockResolvedValue(user);
      vi.mocked(passwordHasher.compare).mockResolvedValue(true);

      await expect(authService.login(loginDto)).rejects.toThrow('Account has been disabled');
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens successfully', async () => {
      const refreshTokenDto = {
        refreshToken: 'valid-refresh-token',
      };

      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);
      vi.mocked(usersRepository.findById).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        accountType: AccountType.READER,
        passwordHash: 'hashed-password',
        adminRole: null,
        avatar: null,
        bio: null,
        googleId: null,
        facebookId: null,
        twitterId: null,
        githubId: null,
        appleId: null,
        tiktokId: null,
        isVerified: false,
        onboardingCompleted: false,
        accessBlocked: false,
        lastLoginAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User);
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('new-access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('new-refresh-token');

      const result = await authService.refreshTokens(refreshTokenDto);

      expect(result.tokens.accessToken).toBe('new-access-token');
      expect(result.tokens.refreshToken).toBe('new-refresh-token');
    });

    it('rotates the refresh token by blacklisting the one it just consumed', async () => {
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);
      vi.mocked(usersRepository.findById).mockResolvedValue(refreshableUser());
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('new-access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('new-refresh-token');

      await authService.refreshTokens({ refreshToken: 'old-refresh-token' });

      // The key is a sha256 of the token, never the token itself: a Valkey key is written to
      // RDB/AOF dumps and appears in MONITOR, SLOWLOG and SCAN output, so a raw-token key turns
      // any read path over those into a token-theft primitive.
      expect(valkeyService.set).toHaveBeenCalledWith(
        `refresh_token:blacklist:${fingerprintToken('old-refresh-token')}`,
        'revoked',
        expect.any(Number),
      );
      expect(valkeyService.set).not.toHaveBeenCalledWith(
        expect.stringContaining('old-refresh-token'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('blacklists for at least as long as the refresh token can still be valid', async () => {
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);
      vi.mocked(usersRepository.findById).mockResolvedValue(refreshableUser());
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('new-access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('new-refresh-token');

      await authService.refreshTokens({ refreshToken: 'old-refresh-token' });

      // 7d, derived from jwt.refreshExpiry rather than hardcoded. A blacklist shorter than the
      // token lifetime means a token revoked at logout becomes usable again part-way through
      // its own validity.
      const ttlSeconds = vi.mocked(valkeyService.set).mock.calls.at(-1)?.[2];
      expect(ttlSeconds).toBe(7 * 24 * 60 * 60);
    });

    it('derives the blacklist TTL from a longer configured refresh expiry', async () => {
      // An operator who sets REFRESH_TOKEN_EXPIRY=30d must get a 30-day blacklist. A literal 7
      // days here is what let a revoked token resurrect for the remaining 23 days.
      configService.get.mockImplementation((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          'jwt.refreshExpiry': '30d',
          'jwt.expiry': '15m',
          'apple.clientId': 'com.hakawi.web',
        };
        return values[key] ?? fallback;
      });
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);
      vi.mocked(usersRepository.findById).mockResolvedValue(refreshableUser());
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('new-access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('new-refresh-token');

      await authService.refreshTokens({ refreshToken: 'old-refresh-token' });

      expect(vi.mocked(valkeyService.set).mock.calls.at(-1)?.[2]).toBe(30 * 24 * 60 * 60);
    });

    it('refuses to refresh for an account an administrator blocked', async () => {
      // Refresh is silent and cookie-driven, so a blocked user holding a valid refresh token
      // would otherwise keep minting access tokens for the token's whole lifetime — up to seven
      // days — with no login and no event in the log.
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);
      vi.mocked(usersRepository.findById).mockResolvedValue(refreshableUser({ accessBlocked: true }));

      await expect(authService.refreshTokens({ refreshToken: 'old-refresh-token' })).rejects.toThrow(
        'Account has been disabled',
      );
      expect(jwtHelper.generateAccessToken).not.toHaveBeenCalled();
      // The presented token is burned, so a blocked user cannot retry the same cookie.
      expect(valkeyService.set).toHaveBeenCalledWith(
        `refresh_token:blacklist:${fingerprintToken('old-refresh-token')}`,
        'revoked',
        expect.any(Number),
      );
    });

    it('never reissues a refresh token that a previous rotation already revoked', async () => {
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(true);
      vi.mocked(usersRepository.findById).mockResolvedValue(refreshableUser());
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('new-refresh-token');

      await expect(authService.refreshTokens({ refreshToken: 'revoked-refresh-token' })).rejects.toThrow(
        'Refresh token has been revoked',
      );
      expect(jwtHelper.generateRefreshToken).not.toHaveBeenCalled();
      expect(valkeyService.set).not.toHaveBeenCalled();
    });

    it('logs the reuse distinctly, so an operator can tell a replay from a typo', async () => {
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(true);

      await expect(authService.refreshTokens({ refreshToken: 'revoked-refresh-token' })).rejects.toThrow(
        UnauthorizedException,
      );

      expect(winstonLoggerService.warn).toHaveBeenCalledWith(expect.stringContaining('reuse detected'), 'AuthService');
    });

    // WHY: the old order minted the replacement pair first and revoked afterwards, so two
    // refreshes of the same cookie that overlapped both passed the reuse check and both returned a
    // live pair. Burning the presented token first makes the loser of that race fail closed.
    it('burns the presented token before it mints the replacement', async () => {
      const order: string[] = [];
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);
      vi.mocked(valkeyService.set).mockImplementation(async () => {
        order.push('revoked');
      });
      vi.mocked(usersRepository.findById).mockResolvedValue(refreshableUser());
      vi.mocked(jwtHelper.generateAccessToken!).mockImplementation(() => {
        order.push('issued');
        return 'new-access-token';
      });
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('new-refresh-token');

      await authService.refreshTokens({ refreshToken: 'old-refresh-token' });

      expect(order).toEqual(['revoked', 'issued']);
    });

    it('leaves the user logged out when minting fails after the token was burned', async () => {
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);
      vi.mocked(usersRepository.findById).mockResolvedValue(refreshableUser());
      vi.mocked(jwtHelper.generateAccessToken!).mockImplementation(() => {
        throw new Error('signing unavailable');
      });

      await expect(authService.refreshTokens({ refreshToken: 'old-refresh-token' })).rejects.toThrow(
        'signing unavailable',
      );
      // The key is a sha256 of the token, never the token itself: a Valkey key is written to
      // RDB/AOF dumps and appears in MONITOR, SLOWLOG and SCAN output, so a raw-token key turns
      // any read path over those into a token-theft primitive.
      expect(valkeyService.set).toHaveBeenCalledWith(
        `refresh_token:blacklist:${fingerprintToken('old-refresh-token')}`,
        'revoked',
        expect.any(Number),
      );
      expect(valkeyService.set).not.toHaveBeenCalledWith(
        expect.stringContaining('old-refresh-token'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('blacklists for at least as long as the refresh token can still be valid', async () => {
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);
      vi.mocked(usersRepository.findById).mockResolvedValue(refreshableUser());
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('new-access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('new-refresh-token');

      await authService.refreshTokens({ refreshToken: 'old-refresh-token' });

      // 7d, derived from jwt.refreshExpiry rather than hardcoded. A blacklist shorter than the
      // token lifetime means a token revoked at logout becomes usable again part-way through
      // its own validity.
      const ttlSeconds = vi.mocked(valkeyService.set).mock.calls.at(-1)?.[2];
      expect(ttlSeconds).toBe(7 * 24 * 60 * 60);
    });

    it('derives the blacklist TTL from a longer configured refresh expiry', async () => {
      // An operator who sets REFRESH_TOKEN_EXPIRY=30d must get a 30-day blacklist. A literal 7
      // days here is what let a revoked token resurrect for the remaining 23 days.
      configService.get.mockImplementation((key: string, fallback?: string) => {
        const values: Record<string, string> = {
          'jwt.refreshExpiry': '30d',
          'jwt.expiry': '15m',
          'apple.clientId': 'com.hakawi.web',
        };
        return values[key] ?? fallback;
      });
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);
      vi.mocked(usersRepository.findById).mockResolvedValue(refreshableUser());
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('new-access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('new-refresh-token');

      await authService.refreshTokens({ refreshToken: 'old-refresh-token' });

      expect(vi.mocked(valkeyService.set).mock.calls.at(-1)?.[2]).toBe(30 * 24 * 60 * 60);
    });

    it.each([
      { label: 'no token at all', dto: {} },
      { label: 'an empty cookie value', dto: { refreshToken: '' } },
      { label: 'a whitespace-only value', dto: { refreshToken: '   ' } },
    ])('refuses $label with a 401 rather than a 500', async ({ dto }) => {
      await expect(authService.refreshTokens(dto)).rejects.toThrow(UnauthorizedException);
      await expect(authService.refreshTokens(dto)).rejects.toThrow('Refresh token is required');

      expect(jwtHelper.verifyRefreshToken).not.toHaveBeenCalled();
      expect(valkeyService.exists).not.toHaveBeenCalled();
      expect(winstonLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('without a refresh token'),
        'AuthService',
      );
    });

    it('ignores padding around a pasted refresh token instead of failing on it', async () => {
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);
      vi.mocked(usersRepository.findById).mockResolvedValue(refreshableUser());
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('new-access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('new-refresh-token');

      await authService.refreshTokens({ refreshToken: '  pasted-refresh-token  ' });

      expect(jwtHelper.verifyRefreshToken).toHaveBeenCalledWith('pasted-refresh-token');
      expect(valkeyService.exists).toHaveBeenCalledWith(
        `refresh_token:blacklist:${fingerprintToken('pasted-refresh-token')}`,
      );
    });

    it('should throw UnauthorizedException with invalid refresh token', async () => {
      const refreshTokenDto = {
        refreshToken: 'invalid-token',
      };

      vi.mocked(jwtHelper.verifyRefreshToken!).mockImplementation(() => {
        throw new Error('Invalid token');
      });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);

      await expect(authService.refreshTokens(refreshTokenDto)).rejects.toThrow('Invalid refresh token');
      expect(valkeyService.set).not.toHaveBeenCalled();
    });
  });

  describe('session', () => {
    it('should return session data', async () => {
      vi.mocked(usersRepository.findById).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        accountType: AccountType.READER,
        passwordHash: 'hashed',
        adminRole: null,
        avatar: null,
        bio: null,
        googleId: null,
        facebookId: null,
        twitterId: null,
        githubId: null,
        appleId: null,
        tiktokId: null,
        isVerified: false,
        onboardingCompleted: false,
        accessBlocked: false,
        lastLoginAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User);

      const result = await authService.session('user-123');

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('expiresAt');
      expect(result.user.id).toBe('user-123');
    });
  });

  describe('logout', () => {
    it('should blacklist refresh token', async () => {
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);

      const result = await authService.logout('valid-refresh-token');

      expect(result).toHaveProperty('message', 'Logged out successfully');
      expect(valkeyService.set).toHaveBeenCalledWith(
        expect.stringContaining('refresh_token:blacklist:'),
        'revoked',
        expect.any(Number),
      );
    });

    it('should throw UnauthorizedException with invalid refresh token', async () => {
      vi.mocked(jwtHelper.verifyRefreshToken!).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.logout('invalid-token')).rejects.toThrow('Invalid refresh token');
    });

    it('succeeds without a token so a client that holds no session can still end one', async () => {
      const result = await authService.logout(undefined);

      expect(result).toHaveProperty('message');
      expect(jwtHelper.verifyRefreshToken).not.toHaveBeenCalled();
      expect(valkeyService.set).not.toHaveBeenCalled();
    });

    it('does not claim it revoked anything when no token was presented', async () => {
      const result = await authService.logout(undefined);

      // WHY: the old text asserted a security effect that had not happened, so a log review read
      // "the session was killed" for a request that revoked nothing.
      expect(result.message).not.toBe('Logged out successfully');
      expect(result.message).toContain('no session token was presented to revoke');
    });

    it('warns that a tokenless logout left the presented session live', async () => {
      await authService.logout(undefined);

      expect(winstonLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('nothing was revoked'),
        'AuthService',
      );
    });

    it('treats an empty cookie value as no token at all', async () => {
      const result = await authService.logout('');

      expect(result).toHaveProperty('message');
      expect(winstonLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('nothing was revoked'),
        'AuthService',
      );
      expect(valkeyService.set).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only value as no token at all, like the refresh path does', async () => {
      const result = await authService.logout('   ');

      expect(result).toHaveProperty('message');
      expect(jwtHelper.verifyRefreshToken).not.toHaveBeenCalled();
      expect(valkeyService.set).not.toHaveBeenCalled();
    });

    it('keeps the plain success message on the path that really did revoke', async () => {
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
        type: 'refresh',
      } as JwtPayload & { type: string });
      vi.mocked(valkeyService.set).mockResolvedValue(undefined);

      const result = await authService.logout('valid-refresh-token');

      expect(result).toEqual({ message: 'Logged out successfully' });
    });

    it('refuses an access token presented as a refresh token', async () => {
      vi.mocked(jwtHelper.verifyRefreshToken!).mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
        accountType: AccountType.READER,
      } as JwtPayload & { type: string });

      await expect(authService.logout('access-token')).rejects.toThrow('Invalid refresh token');
      expect(valkeyService.set).not.toHaveBeenCalled();
    });
  });

  describe('getAuthorizationUrl', () => {
    // WHY the calls are awaited: the CSRF state is written to Valkey before the redirect URL is
    // returned, so a caller that did not await could send the browser to a provider whose
    // callback would then race the write. These tests await for the same reason the controller
    // does.
    it('should generate Google authorization URL', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3001/api/v1/auth/oauth/google/callback';

      const url = await authService.getAuthorizationUrl('google');

      expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('state=');
    });

    it('writes the CSRF state before returning, so the callback cannot race it', async () => {
      await authService.getAuthorizationUrl('google', 'fixed-state-token');

      expect(valkeyService.set).toHaveBeenCalledWith('oauth:state:fixed-state-token', 'google', 600);
    });

    it('should generate Facebook authorization URL', async () => {
      process.env.FACEBOOK_APP_ID = 'test-fb-app-id';
      process.env.FACEBOOK_CALLBACK_URL = 'http://localhost:3001/api/v1/auth/oauth/facebook/callback';

      const url = await authService.getAuthorizationUrl('facebook');

      expect(url).toContain('facebook.com');
      expect(url).toContain('client_id=test-fb-app-id');
    });

    it('should generate GitHub authorization URL', async () => {
      process.env.GITHUB_CLIENT_ID = 'test-gh-client-id';
      process.env.GITHUB_CALLBACK_URL = 'http://localhost:3001/api/v1/auth/oauth/github/callback';

      const url = await authService.getAuthorizationUrl('github');

      expect(url).toContain('github.com/login/oauth/authorize');
      expect(url).toContain('client_id=test-gh-client-id');
    });

    it('should throw BadRequestException for unsupported provider', async () => {
      await expect(authService.getAuthorizationUrl('unknown')).rejects.toThrow('Unsupported OAuth provider: unknown');
    });
  });

  describe('handleOAuthCallback', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
      vi.mocked(valkeyService.get).mockResolvedValue(null as unknown as string);
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
    });

    it('should create new OAuth user and return tokens', async () => {
      const state = 'state-123';
      vi.mocked(valkeyService.get).mockResolvedValue('google');

      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'google-access-token' }))
        .mockResolvedValueOnce(oauthResponse({ sub: 'google-id-123', email: 'test@example.com', name: 'Test User' }));

      vi.mocked(usersRepository.findByGoogleId).mockResolvedValue(null);
      vi.mocked(usersRepository.create).mockResolvedValue({
        id: 'new-user-123',
        email: 'test@example.com',
        username: 'test',
        name: 'Test User',
        accountType: AccountType.READER,
        passwordHash: null,
        adminRole: null,
        avatar: null,
        bio: null,
        googleId: 'google-id-123',
        facebookId: null,
        twitterId: null,
        githubId: null,
        appleId: null,
        tiktokId: null,
        isVerified: false,
        onboardingCompleted: false,
        accessBlocked: false,
        lastLoginAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User);
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('refresh-token');

      const result = await authService.handleOAuthCallback('google', 'valid-code', state);

      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('user.registered', expect.any(Object));
      expect(valkeyService.del).toHaveBeenCalledWith('oauth:state:state-123');
    });

    it('refuses OAuth sign-in for an account an administrator blocked', async () => {
      // OAuth was the one front door with no ban check: the provider lookup returned the account
      // and tokens were minted without ever reading `accessBlocked`, so a blocked user could
      // walk straight back in through any of the five providers.
      const state = 'state-123';
      vi.mocked(valkeyService.get).mockResolvedValue('google');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'google-access-token' }))
        .mockResolvedValueOnce(oauthResponse({ sub: 'google-id-123', email: 'test@example.com', name: 'Test User' }));
      vi.mocked(usersRepository.findByGoogleId).mockResolvedValue(
        refreshableUser({ googleId: 'google-id-123', accessBlocked: true }),
      );

      await expect(authService.handleOAuthCallback('google', 'valid-code', state)).rejects.toThrow(
        'Account has been disabled',
      );
      expect(jwtHelper.generateAccessToken).not.toHaveBeenCalled();
      expect(jwtHelper.generateRefreshToken).not.toHaveBeenCalled();
    });

    it('should login existing OAuth user and return tokens', async () => {
      const state = 'state-123';
      vi.mocked(valkeyService.get).mockResolvedValue('google');

      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'google-access-token' }))
        .mockResolvedValueOnce(oauthResponse({ sub: 'user-123', email: 'test@example.com', name: 'Test User' }));

      vi.mocked(usersRepository.findByGoogleId).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        accountType: AccountType.READER,
        passwordHash: null,
        adminRole: null,
        avatar: null,
        bio: null,
        googleId: 'google-id-123',
        facebookId: null,
        twitterId: null,
        githubId: null,
        appleId: null,
        tiktokId: null,
        isVerified: false,
        onboardingCompleted: false,
        accessBlocked: false,
        lastLoginAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User);
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('refresh-token');

      const result = await authService.handleOAuthCallback('google', 'valid-code', state);

      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
      expect(valkeyService.del).toHaveBeenCalledWith('oauth:state:state-123');
    });

    it('should throw BadRequestException for missing state', async () => {
      await expect(authService.handleOAuthCallback('google', 'valid-code')).rejects.toThrow(
        'Invalid or expired state parameter',
      );
    });

    it('should throw BadRequestException for mismatched state provider', async () => {
      const state = 'state-123';
      vi.mocked(valkeyService.get).mockResolvedValue('google');

      await expect(authService.handleOAuthCallback('facebook', 'valid-code', state)).rejects.toThrow(
        'State parameter does not match provider',
      );
    });

    it('should throw BadRequestException for unsupported provider', async () => {
      const state = 'state-123';
      vi.mocked(valkeyService.get).mockResolvedValue('google');

      await expect(authService.handleOAuthCallback('unknown', 'valid-code', state)).rejects.toThrow(
        'Unsupported OAuth provider: unknown',
      );
    });
  });

  describe('OAuth provider response validation', () => {
    const STATE = 'state-123';

    function arrangeState(): void {
      vi.mocked(valkeyService.get).mockResolvedValue('google');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('refresh-token');
    }

    function newUser(): User {
      return {
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        name: 'Test User',
        accountType: AccountType.READER,
        passwordHash: null,
        adminRole: null,
        avatar: null,
        bio: null,
        googleId: null,
        facebookId: null,
        twitterId: null,
        githubId: null,
        appleId: null,
        tiktokId: null,
        isVerified: false,
        onboardingCompleted: false,
        accessBlocked: false,
        lastLoginAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;
    }

    it('rejects a Google token response with no access token', async () => {
      arrangeState();
      vi.mocked(global.fetch!).mockResolvedValue(oauthResponse({ token_type: 'Bearer' }));

      await expect(authService.handleOAuthCallback('google', 'code', STATE)).rejects.toThrow(
        'Failed to exchange Google authorization code',
      );
    });

    it('rejects a Google profile with no subject', async () => {
      arrangeState();
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(oauthResponse({ email: 'test@example.com' }));

      await expect(authService.handleOAuthCallback('google', 'code', STATE)).rejects.toThrow(
        'Failed to fetch Google user profile',
      );
    });

    it('derives a Google email when the scope did not return one', async () => {
      arrangeState();
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(oauthResponse({ sub: 'google-1', name: 'Keeper' }));
      vi.mocked(usersRepository.findByGoogleId).mockResolvedValue(newUser());

      await authService.handleOAuthCallback('google', 'code', STATE);

      expect(usersRepository.findByGoogleId).toHaveBeenCalledWith('google-1');
    });

    it('falls back to a placeholder when a Google profile carries no name', async () => {
      arrangeState();
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(oauthResponse({ sub: 'google-1', email: 'test@example.com' }));
      vi.mocked(usersRepository.findByGoogleId).mockResolvedValue(null);
      vi.mocked(usersRepository.create).mockResolvedValue(newUser());
      vi.mocked(eventValidatorService.emit).mockResolvedValue(undefined);

      await authService.handleOAuthCallback('google', 'code', STATE);

      expect(usersRepository.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Google User' }));
    });

    it('rejects a Facebook token response that is not an object', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue('facebook');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(global.fetch!).mockResolvedValue(oauthResponse('invalid_request'));

      await expect(authService.handleOAuthCallback('facebook', 'code', STATE)).rejects.toThrow(
        'Failed to exchange Facebook authorization code',
      );
    });

    it('rejects a GitHub profile whose id is not numeric', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue('github');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(oauthResponse({ id: 'not-a-number', login: 'keeper' }));

      await expect(authService.handleOAuthCallback('github', 'code', STATE)).rejects.toThrow(
        'Failed to fetch GitHub user profile',
      );
    });

    it('uses the GitHub login as the username so the derived one is not ambiguous', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue('github');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('refresh-token');
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(oauthResponse({ id: 42, login: 'keeper', email: 'keeper@github.user' }));
      vi.mocked(usersRepository.findByGithubId).mockResolvedValue(null);
      vi.mocked(usersRepository.create).mockResolvedValue({ ...newUser(), githubId: '42' } as User);
      vi.mocked(eventValidatorService.emit).mockResolvedValue(undefined);

      await authService.handleOAuthCallback('github', 'code', STATE);

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'keeper', githubId: '42' }),
      );
    });

    // WHY this group exists: Facebook and GitHub declare `email` nullish and both will answer
    // with "" for a user who has no public address. `??` does not treat "" as absent, so the
    // account was persisted with `email: ''` and every later such sign-in hit the same unique
    // value. Each case is named, because a `||` is the only thing that used to hold this line.
    it.each([
      { label: 'an empty string', email: '' },
      { label: 'a whitespace-only string', email: '   ' },
      { label: 'null', email: null },
    ])('never creates a Facebook account keyed on $label', async ({ email }) => {
      vi.mocked(valkeyService.get).mockResolvedValue('facebook');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('refresh-token');
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(oauthResponse({ id: 'fb-77', name: 'Keeper', email }));
      vi.mocked(usersRepository.findByFacebookId).mockResolvedValue(null);
      vi.mocked(usersRepository.create).mockResolvedValue(newUser());
      vi.mocked(eventValidatorService.emit).mockResolvedValue(undefined);

      await authService.handleOAuthCallback('facebook', 'code', STATE);

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'fb-77@facebook.user', facebookId: 'fb-77' }),
      );
    });

    it('never creates a GitHub account keyed on an omitted email', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue('github');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('refresh-token');
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(oauthResponse({ id: 42, login: 'keeper' }));
      vi.mocked(usersRepository.findByGithubId).mockResolvedValue(null);
      vi.mocked(usersRepository.create).mockResolvedValue(newUser());
      vi.mocked(eventValidatorService.emit).mockResolvedValue(undefined);

      await authService.handleOAuthCallback('github', 'code', STATE);

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: '42@github.user', username: 'keeper', githubId: '42' }),
      );
    });

    it('keeps a real provider email rather than replacing it with the placeholder', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue('facebook');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('refresh-token');
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(oauthResponse({ id: 'fb-77', name: 'Keeper', email: '  keeper@hakawi.com  ' }));
      vi.mocked(usersRepository.findByFacebookId).mockResolvedValue(null);
      vi.mocked(usersRepository.create).mockResolvedValue(newUser());
      vi.mocked(eventValidatorService.emit).mockResolvedValue(undefined);

      await authService.handleOAuthCallback('facebook', 'code', STATE);

      expect(usersRepository.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'keeper@hakawi.com' }));
    });

    it('derives the TikTok placeholder from the provider account id', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue('tiktok');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(jwtHelper.generateAccessToken!).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken!).mockReturnValue('refresh-token');
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(oauthResponse({ code: 0, data: { user: { user_id: 'tt-5', display_name: 'K' } } }));
      vi.mocked(usersRepository.findByTiktokId).mockResolvedValue(null);
      vi.mocked(usersRepository.create).mockResolvedValue(newUser());
      vi.mocked(eventValidatorService.emit).mockResolvedValue(undefined);

      await authService.handleOAuthCallback('tiktok', 'code', STATE);

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'tt-5@tiktok.user', tiktokId: 'tt-5' }),
      );
    });

    it('rejects a TikTok user info envelope whose data block is a string', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue('tiktok');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(oauthResponse({ code: 0, data: 'nope' }));

      await expect(authService.handleOAuthCallback('tiktok', 'code', STATE)).rejects.toThrow(
        'Failed to fetch TikTok user profile',
      );
    });

    it('rejects a TikTok user info envelope that reports a non-zero code', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue('tiktok');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(global.fetch!)
        .mockResolvedValueOnce(oauthResponse({ access_token: 'token' }))
        .mockResolvedValueOnce(oauthResponse({ code: 36008, message: 'invalid access token' }));

      await expect(authService.handleOAuthCallback('tiktok', 'code', STATE)).rejects.toThrow(
        'Failed to fetch TikTok user profile',
      );
    });

    it('rejects an Apple token response with no id token', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue('apple');
      vi.mocked(valkeyService.del).mockResolvedValue(undefined);
      vi.mocked(global.fetch!).mockResolvedValue(oauthResponse({ access_token: 'only-access' }));

      await expect(authService.handleOAuthCallback('apple', 'code', STATE)).rejects.toThrow(
        'Failed to exchange Apple authorization code',
      );
    });

    it('records why an OAuth call failed before surfacing the client facing message', async () => {
      arrangeState();
      vi.mocked(global.fetch!).mockResolvedValue(oauthResponse({}, { status: 500, statusText: 'Server Error' }));

      await expect(authService.handleOAuthCallback('google', 'code', STATE)).rejects.toThrow(
        'Failed to exchange Google authorization code',
      );
      expect(winstonLoggerService.warn).toHaveBeenCalledWith(expect.stringContaining('google:token'), 'AuthService');
    });
  });
});
