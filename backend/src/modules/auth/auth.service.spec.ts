import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PasswordHasher } from '../../common/utils/password.util.js';
import { JwtHelper, JwtPayload } from '../../common/utils/jwt.util.js';
import { ValkeyService } from '../../common/services/valkey.service.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import type { CircuitBreakerService } from '../../common/resilience/circuit-breaker.service.js';
import { AccountType } from '../../common/constants/roles.ts';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface.js';
import { USERS_REPOSITORY } from '../users/interfaces/users-repository.interface.js';
import type { User } from '../users/interfaces/users-repository.interface.js';
import { EmailVerificationService } from '../email-verification/email-verification.service.js';

type MockUsersRepository = Partial<IUsersRepository>;

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

type MockEventEmitter = {
  emit: ReturnType<typeof vi.fn>;
};

type MockEmailVerificationService = {
  generateToken: ReturnType<typeof vi.fn>;
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
  let eventEmitter: MockEventEmitter;
  let emailVerificationService: MockEmailVerificationService;
  let circuitBreaker: MockCircuitBreakerService;

  beforeEach(() => {
    usersRepository = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUsername: vi.fn(),
      create: vi.fn(),
      findByGoogleId: vi.fn(),
      findByFacebookId: vi.fn(),
      findByTwitterId: vi.fn(),
      findByGithubId: vi.fn(),
      findByAppleId: vi.fn(),
      findByTiktokId: vi.fn(),
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

    eventEmitter = {
      emit: vi.fn(),
    };

    emailVerificationService = {
      generateToken: vi.fn().mockResolvedValue('123456'),
    };

    circuitBreaker = {
      execute: vi.fn().mockImplementation((_name: string, fn: () => Promise<any>) => fn()),
    };

    authService = new AuthService(
      usersRepository as unknown as IUsersRepository,
      passwordHasher as unknown as PasswordHasher,
      jwtHelper as unknown as JwtHelper,
      valkeyService as unknown as ValkeyService,
      winstonLoggerService as unknown as WinstonLoggerService,
      circuitBreaker as unknown as CircuitBreakerService,
      eventEmitter as unknown as EventEmitter2,
      emailVerificationService as unknown as EmailVerificationService,
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
      vi.mocked(jwtHelper.generateAccessToken).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken).mockReturnValue('refresh-token');

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
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.registered',
        expect.any(Object),
      );
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
      vi.mocked(jwtHelper.generateAccessToken).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken).mockReturnValue('refresh-token');

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

      vi.mocked(jwtHelper.verifyRefreshToken).mockReturnValue({
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
      vi.mocked(jwtHelper.generateAccessToken).mockReturnValue('new-access-token');
      vi.mocked(jwtHelper.generateRefreshToken).mockReturnValue('new-refresh-token');

      const result = await authService.refreshTokens(refreshTokenDto);

      expect(result.tokens.accessToken).toBe('new-access-token');
      expect(result.tokens.refreshToken).toBe('new-refresh-token');
    });

    it('should throw UnauthorizedException with invalid refresh token', async () => {
      const refreshTokenDto = {
        refreshToken: 'invalid-token',
      };

      vi.mocked(jwtHelper.verifyRefreshToken).mockImplementation(() => {
        throw new Error('Invalid token');
      });
      vi.mocked(valkeyService.exists).mockResolvedValue(false);

      await expect(authService.refreshTokens(refreshTokenDto)).rejects.toThrow('Invalid refresh token');
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
      vi.mocked(jwtHelper.verifyRefreshToken).mockReturnValue({
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
      vi.mocked(jwtHelper.verifyRefreshToken).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.logout('invalid-token')).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate Google authorization URL', () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3001/api/v1/auth/oauth/google/callback';

      const url = authService.getAuthorizationUrl('google');

      expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('state=');
    });

    it('should generate Facebook authorization URL', () => {
      process.env.FACEBOOK_APP_ID = 'test-fb-app-id';
      process.env.FACEBOOK_CALLBACK_URL = 'http://localhost:3001/api/v1/auth/oauth/facebook/callback';

      const url = authService.getAuthorizationUrl('facebook');

      expect(url).toContain('facebook.com');
      expect(url).toContain('client_id=test-fb-app-id');
    });

    it('should generate GitHub authorization URL', () => {
      process.env.GITHUB_CLIENT_ID = 'test-gh-client-id';
      process.env.GITHUB_CALLBACK_URL = 'http://localhost:3001/api/v1/auth/oauth/github/callback';

      const url = authService.getAuthorizationUrl('github');

      expect(url).toContain('github.com/login/oauth/authorize');
      expect(url).toContain('client_id=test-gh-client-id');
    });

    it('should throw BadRequestException for unsupported provider', () => {
      expect(() => authService.getAuthorizationUrl('unknown')).toThrow('Unsupported OAuth provider: unknown');
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

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'google-access-token' }),
      } as Response).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sub: 'google-id-123', email: 'test@example.com', name: 'Test User' }),
      } as Response);

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
      vi.mocked(jwtHelper.generateAccessToken).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken).mockReturnValue('refresh-token');

      const result = await authService.handleOAuthCallback('google', 'valid-code', state);

      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.registered',
        expect.any(Object),
      );
      expect(valkeyService.del).toHaveBeenCalledWith('oauth:state:state-123');
    });

    it('should login existing OAuth user and return tokens', async () => {
      const state = 'state-123';
      vi.mocked(valkeyService.get).mockResolvedValue('google');

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'google-access-token' }),
      } as Response).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sub: 'user-123', email: 'test@example.com', name: 'Test User' }),
      } as Response);

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
      vi.mocked(jwtHelper.generateAccessToken).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken).mockReturnValue('refresh-token');

      const result = await authService.handleOAuthCallback('google', 'valid-code', state);

      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
      expect(valkeyService.del).toHaveBeenCalledWith('oauth:state:state-123');
    });

    it('should throw BadRequestException for missing state', async () => {
      await expect(authService.handleOAuthCallback('google', 'valid-code')).rejects.toThrow('Invalid or expired state parameter');
    });

    it('should throw BadRequestException for mismatched state provider', async () => {
      const state = 'state-123';
      vi.mocked(valkeyService.get).mockResolvedValue('google');

      await expect(authService.handleOAuthCallback('facebook', 'valid-code', state)).rejects.toThrow('State parameter does not match provider');
    });

    it('should throw BadRequestException for unsupported provider', async () => {
      const state = 'state-123';
      vi.mocked(valkeyService.get).mockResolvedValue('google');

      await expect(authService.handleOAuthCallback('unknown', 'valid-code', state)).rejects.toThrow('Unsupported OAuth provider: unknown');
    });
  });
});
