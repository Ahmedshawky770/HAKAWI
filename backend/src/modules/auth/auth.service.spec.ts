import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { PasswordHasher } from '../../common/utils/password.util.js';
import { JwtHelper, JwtPayload } from '../../common/utils/jwt.util.js';
import { ValkeyService } from '../../common/services/valkey.service.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { AccountType } from '../../common/constants/roles.js';
import type { User } from '../users/interfaces/users-repository.interface.js';
import type { UserResponseDto } from '../users/dto/users.dto.js';

type MockUsersService = {
  findByEmail: ReturnType<typeof vi.fn>;
  findByUsername: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  updateLastLogin: ReturnType<typeof vi.fn>;
  findByGoogleId: ReturnType<typeof vi.fn>;
  findByFacebookId: ReturnType<typeof vi.fn>;
  findByTwitterId: ReturnType<typeof vi.fn>;
  findByGithubId: ReturnType<typeof vi.fn>;
  findByAppleId: ReturnType<typeof vi.fn>;
  findByTiktokId: ReturnType<typeof vi.fn>;
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
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: MockUsersService;
  let passwordHasher: MockPasswordHasher;
  let jwtHelper: MockJwtHelper;
  let valkeyService: MockValkeyService;
  let winstonLoggerService: MockWinstonLoggerService;

  beforeEach(() => {
    usersService = {
      findByEmail: vi.fn(),
      findByUsername: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      updateLastLogin: vi.fn(),
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
    };

    winstonLoggerService = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    authService = new AuthService(
      usersService as unknown as UsersService,
      passwordHasher as unknown as PasswordHasher,
      jwtHelper as unknown as JwtHelper,
      valkeyService as unknown as ValkeyService,
      winstonLoggerService as unknown as WinstonLoggerService,
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

      vi.mocked(usersService.findByEmail).mockResolvedValue(null);
      vi.mocked(usersService.findByUsername).mockResolvedValue(null);
      vi.mocked(passwordHasher.hash).mockResolvedValue('hashed-password');
      vi.mocked(usersService.create).mockResolvedValue({
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
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          username: registerDto.username,
          passwordHash: 'hashed-password',
          accountType: AccountType.READER,
        }),
      );
    });

    it('should throw ConflictException when email already exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        username: 'testuser',
      };

      vi.mocked(usersService.findByEmail).mockResolvedValue({
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

      vi.mocked(usersService.findByEmail).mockResolvedValue(null);
      vi.mocked(usersService.findByUsername).mockResolvedValue({
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

      vi.mocked(usersService.findByEmail).mockResolvedValue(user);
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

      vi.mocked(usersService.findByEmail).mockResolvedValue(null);

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

      vi.mocked(usersService.findByEmail).mockResolvedValue(user);
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
      vi.mocked(usersService.findById).mockResolvedValue({
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
      } as UserResponseDto);
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
    it('should return session with fresh tokens', async () => {
      vi.mocked(usersService.findById).mockResolvedValue({
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
      } as UserResponseDto);
      vi.mocked(jwtHelper.generateAccessToken).mockReturnValue('access-token');
      vi.mocked(jwtHelper.generateRefreshToken).mockReturnValue('refresh-token');

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

  describe('oauthLogin', () => {
    it('should login existing OAuth user', async () => {
      vi.mocked(usersService.findByGoogleId).mockResolvedValue({
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

      const result = await authService.oauthLogin('google', {
        id: 'google-id-123',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(result).toHaveProperty('tokens');
      expect(result.user.id).toBe('user-123');
    });

    it('should create new OAuth user when not exists', async () => {
      vi.mocked(usersService.findByGoogleId).mockResolvedValue(null);
      vi.mocked(usersService.create).mockResolvedValue({
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

      const result = await authService.oauthLogin('google', {
        id: 'google-id-123',
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(result).toHaveProperty('tokens');
      expect(result.user.id).toBe('new-user-123');
    });

    it('should throw BadRequestException for unsupported provider', async () => {
      await expect(authService.oauthLogin('unknown', { id: '1', email: 'test@example.com', name: 'Test' }))
        .rejects.toThrow('Unsupported OAuth provider: unknown');
    });

    it('should login existing Facebook OAuth user', async () => {
      vi.mocked(usersService.findByFacebookId).mockResolvedValue({
        id: 'user-456',
        email: 'fbuser@example.com',
        username: 'fbuser',
        name: 'FB User',
        accountType: AccountType.READER,
        passwordHash: null,
        adminRole: null,
        avatar: null,
        bio: null,
        googleId: null,
        facebookId: 'fb-id-123',
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

      const result = await authService.oauthLogin('facebook', {
        id: 'fb-id-123',
        email: 'fbuser@example.com',
        name: 'FB User',
      });

      expect(result).toHaveProperty('tokens');
      expect(result.user.id).toBe('user-456');
    });
  });
});
