import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service.ts';
import { PasswordHasher } from '../../common/utils/password.util.ts';
import { JwtHelper, JwtPayload } from '../../common/utils/jwt.util.ts';
import { RegisterDto, LoginDto, RefreshTokenDto, AuthResponseDto, SessionResponseDto, LogoutResponseDto, OAuthTokensDto, OAuthUserInfoDto } from './dto/auth.dto.ts';
import { AccountType } from '../../common/constants/roles.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

@Injectable()
export class AuthService {
  private readonly REFRESH_TOKEN_BLACKLIST_PREFIX = 'refresh_token:blacklist:';

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordHasher: PasswordHasher,
    private readonly jwtHelper: JwtHelper,
    private readonly valkeyService: ValkeyService,
    private readonly winstonLoggerService: WinstonLoggerService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    this.winstonLoggerService.info(`Attempting registration for email: ${dto.email}`, 'AuthService');

    const existingEmail = await Promise.resolve(this.usersService.findByEmail(dto.email)).catch(() => null);
    if (existingEmail) {
      this.winstonLoggerService.warn(`Registration failed: email ${dto.email} already exists`, 'AuthService');
      throw new ConflictException('Email already exists');
    }

    const existingUsername = await Promise.resolve(this.usersService.findByUsername(dto.username)).catch(() => null);
    if (existingUsername) {
      this.winstonLoggerService.warn(`Registration failed: username ${dto.username} already exists`, 'AuthService');
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);

    const user = await Promise.resolve(this.usersService.create({
      email: dto.email,
      username: dto.username,
      name: dto.name,
      passwordHash,
      accountType: AccountType.READER,
    }));

    const tokens = await this.generateTokens(user);

    await Promise.resolve(this.usersService.updateLastLogin(user.id));

    this.winstonLoggerService.info(`User registered successfully: ${user.id}`, 'AuthService');

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        accountType: user.accountType,
      },
      tokens,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    this.winstonLoggerService.info(`Login attempt for email: ${dto.email}`, 'AuthService');

    const user = await Promise.resolve(this.usersService.findByEmail(dto.email)).catch(() => null);

    if (!user || !user.passwordHash) {
      this.winstonLoggerService.warn(`Login failed: invalid credentials for ${dto.email}`, 'AuthService');
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.passwordHasher.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      this.winstonLoggerService.warn(`Login failed: invalid password for ${dto.email}`, 'AuthService');
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.accessBlocked) {
      this.winstonLoggerService.warn(`Login failed: account disabled for ${dto.email}`, 'AuthService');
      throw new UnauthorizedException('Account has been disabled');
    }

    const tokens = await this.generateTokens(user);

    await Promise.resolve(this.usersService.updateLastLogin(user.id));

    this.winstonLoggerService.info(`Login successful for user: ${user.id}`, 'AuthService');

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        accountType: user.accountType,
      },
      tokens,
    };
  }

  async refreshTokens(dto: RefreshTokenDto): Promise<AuthResponseDto> {
    try {
      const payload = Promise.resolve(this.jwtHelper.verifyRefreshToken(dto.refreshToken)) as Promise<JwtPayload>;
      const resolvedPayload = await payload.catch(() => null);
      if (!resolvedPayload) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const blacklisted = await this.valkeyService.exists(this.REFRESH_TOKEN_BLACKLIST_PREFIX + dto.refreshToken);
      if (blacklisted) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      const user = await Promise.resolve(this.usersService.findById(resolvedPayload.sub));

      const tokens = await this.generateTokens(user);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          accountType: user.accountType,
        },
        tokens,
      };
    } catch (error) {
      this.winstonLoggerService.warn('Refresh token validation failed', 'AuthService');
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async session(userId: string): Promise<SessionResponseDto> {
    const user = await Promise.resolve(this.usersService.findById(userId));

    const accessToken = await Promise.resolve(this.jwtHelper.generateAccessToken({
      sub: user.id,
      email: user.email,
      accountType: user.accountType,
    }));

    const refreshToken = await Promise.resolve(this.jwtHelper.generateRefreshToken({
      sub: user.id,
      email: user.email,
      accountType: user.accountType,
    }));

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        accountType: user.accountType,
      },
      expiresAt,
    };
  }

  async logout(refreshToken: string): Promise<LogoutResponseDto> {
    let payload: JwtPayload & { type: string };
    try {
      payload = await this.jwtHelper.verifyRefreshToken(refreshToken);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const ttlMs = 7 * 24 * 60 * 60 * 1000;
    await this.valkeyService.set(this.REFRESH_TOKEN_BLACKLIST_PREFIX + refreshToken, 'revoked', Math.floor(ttlMs / 1000));

    this.winstonLoggerService.info(`Refresh token blacklisted for user: ${payload.sub}`, 'AuthService');

    return {
      message: 'Logged out successfully',
    };
  }

  async oauthLogin(provider: string, oauthUserInfo: OAuthUserInfoDto): Promise<AuthResponseDto> {
    let user;

    switch (provider) {
      case 'google':
        user = await this.usersService.findByGoogleId(oauthUserInfo.id).catch(() => null);
        break;
      case 'facebook':
        user = await this.usersService.findByFacebookId(oauthUserInfo.id).catch(() => null);
        break;
      case 'twitter':
        user = await this.usersService.findByTwitterId(oauthUserInfo.id).catch(() => null);
        break;
      case 'github':
        user = await this.usersService.findByGithubId(oauthUserInfo.id).catch(() => null);
        break;
      case 'apple':
        user = await this.usersService.findByAppleId(oauthUserInfo.id).catch(() => null);
        break;
      case 'tiktok':
        user = await this.usersService.findByTiktokId(oauthUserInfo.id).catch(() => null);
        break;
      default:
        throw new BadRequestException(`Unsupported OAuth provider: ${provider}`);
    }

    if (!user) {
      const username = oauthUserInfo.username || `${oauthUserInfo.email.split('@')[0]}`;
      const providerIdField = provider === 'twitter' ? 'twitterId' : `${provider}Id`;
      user = await Promise.resolve(this.usersService.create({
        [providerIdField]: oauthUserInfo.id,
        email: oauthUserInfo.email,
        name: oauthUserInfo.name,
        username,
        accountType: AccountType.READER,
      }));
    }

    const tokens = await this.generateTokens(user);

    this.winstonLoggerService.info(`OAuth login successful for user: ${user.id} via ${provider}`, 'AuthService');

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        accountType: user.accountType,
      },
      tokens,
    };
  }

  private async generateTokens(user: { id: string; email: string; accountType: string; adminRole?: string | null }) {
    const payload = {
      sub: user.id,
      email: user.email,
      accountType: user.accountType,
      adminRole: user.adminRole ?? undefined,
    };

    const accessToken = await Promise.resolve(this.jwtHelper.generateAccessToken(payload));
    const refreshToken = await Promise.resolve(this.jwtHelper.generateRefreshToken(payload));
    return { accessToken, refreshToken };
  }
}
