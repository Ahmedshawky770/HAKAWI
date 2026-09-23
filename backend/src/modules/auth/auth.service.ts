import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PasswordHasher } from '../../common/utils/password.util.ts';
import { JwtHelper, JwtPayload } from '../../common/utils/jwt.util.ts';
import { fetchJson } from '../../common/utils/fetch.util.ts';
import { AccountType } from '../../common/constants/roles.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { USERS_REPOSITORY } from '../users/interfaces/users-repository.interface.ts';
import type { IUsersRepository } from '../users/interfaces/users-repository.interface.ts';
import { UserRegisteredEvent } from '../users/events/users.event-handler.ts';

import { RegisterDto, LoginDto, RefreshTokenDto, AuthResponseDto, SessionResponseDto, LogoutResponseDto } from './dto/auth.dto.ts';

const OAUTH_PROVIDERS = ['google', 'facebook', 'github', 'apple', 'tiktok'] as const;
type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

interface OAuthUserCreateData {
  email: string;
  name: string;
  username: string;
  accountType: string;
  passwordHash: string | null;
  googleId: string | null;
  facebookId: string | null;
  twitterId: string | null;
  githubId: string | null;
  appleId: string | null;
  tiktokId: string | null;
  [key: string]: string | null;
}

interface GoogleTokenResponse {
  access_token: string;
}

interface GoogleUserResponse {
  sub: string;
  email: string;
  name: string;
}

interface FacebookTokenResponse {
  access_token: string;
}

interface FacebookUserResponse {
  id: string;
  email?: string;
  name: string;
}

interface GithubTokenResponse {
  access_token: string;
}

interface GithubUserResponse {
  id: number;
  email?: string;
  name?: string;
  login: string;
}

interface AppleTokenResponse {
  id_token: string;
}

interface TiktokTokenResponse {
  access_token: string;
}

interface TiktokUserResponse {
  data: {
    user: {
      user_id?: string;
      open_id?: string;
      display_name?: string;
    };
  };
}

@Injectable()
export class AuthService {
  private readonly REFRESH_TOKEN_BLACKLIST_PREFIX = 'refresh_token:blacklist:';
  private readonly OAUTH_STATE_PREFIX = 'oauth:state:';
  private readonly OAUTH_STATE_TTL_SECONDS = 600;

  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    @Inject(PasswordHasher) private readonly passwordHasher: PasswordHasher,
    @Inject(JwtHelper) private readonly jwtHelper: JwtHelper,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(WinstonLoggerService) private readonly winstonLoggerService: WinstonLoggerService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
  ) {}

  getAuthorizationUrl(provider: string, state?: string): string {
    if (!OAUTH_PROVIDERS.includes(provider as OAuthProvider)) {
      throw new BadRequestException(`Unsupported OAuth provider: ${provider}`);
    }

    const stateToken = state || this.generateState();
    void this.valkeyService.set(this.OAUTH_STATE_PREFIX + stateToken, provider, this.OAUTH_STATE_TTL_SECONDS);

    switch (provider) {
      case 'google':
        return this.buildGoogleAuthUrl(stateToken);
      case 'facebook':
        return this.buildFacebookAuthUrl(stateToken);
      case 'github':
        return this.buildGithubAuthUrl(stateToken);
      case 'apple':
        return this.buildAppleAuthUrl(stateToken);
      case 'tiktok':
        return this.buildTiktokAuthUrl(stateToken);
      default:
        throw new BadRequestException(`Unsupported OAuth provider: ${provider}`);
    }
  }

  async handleOAuthCallback(provider: string, code: string, state?: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (!OAUTH_PROVIDERS.includes(provider as OAuthProvider)) {
      throw new BadRequestException(`Unsupported OAuth provider: ${provider}`);
    }

    if (!state) {
      throw new BadRequestException('Invalid or expired state parameter');
    }

    const storedProvider = await this.valkeyService.get(this.OAUTH_STATE_PREFIX + state);
    if (!storedProvider || storedProvider !== provider) {
      throw new BadRequestException('State parameter does not match provider');
    }

    await this.valkeyService.del(this.OAUTH_STATE_PREFIX + state);

    const profile = await this.fetchProviderProfile(provider, code);
    const user = await this.findOrCreateOAuthUser(provider, profile);

    return this.generateTokens(user);
  }

  private generateState(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private buildGoogleAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/oauth/google/callback',
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  private buildFacebookAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID || '',
      redirect_uri: process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/oauth/facebook/callback',
      response_type: 'code',
      scope: 'email',
      state,
    });
    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }

  private buildGithubAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID || '',
      redirect_uri: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/oauth/github/callback',
      scope: 'user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  private buildAppleAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.APPLE_CLIENT_ID || '',
      redirect_uri: process.env.APPLE_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/oauth/apple/callback',
      response_type: 'code',
      scope: 'name email',
      response_mode: 'form_post',
      state,
    });
    return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  private buildTiktokAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || '',
      redirect_uri: process.env.TIKTOK_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/oauth/tiktok/callback',
      response_type: 'code',
      scope: 'user.info.basic',
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize?${params.toString()}`;
  }

  private async fetchProviderProfile(provider: string, code: string): Promise<{ id: string; email: string; name: string; username?: string }> {
    switch (provider) {
      case 'google':
        return this.fetchGoogleProfile(code);
      case 'facebook':
        return this.fetchFacebookProfile(code);
      case 'github':
        return this.fetchGithubProfile(code);
      case 'apple':
        return this.fetchAppleProfile(code);
      case 'tiktok':
        return this.fetchTiktokProfile(code);
      default:
        throw new BadRequestException(`Unsupported OAuth provider: ${provider}`);
    }
  }

  private async fetchGoogleProfile(code: string): Promise<{ id: string; email: string; name: string }> {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/oauth/google/callback',
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestException('Failed to exchange Google authorization code');
    }

    const tokenData = await fetchJson<GoogleTokenResponse>(tokenResponse);
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userResponse.ok) {
      throw new BadRequestException('Failed to fetch Google user profile');
    }

    const userData = await fetchJson<GoogleUserResponse>(userResponse);
    return {
      id: userData.sub,
      email: userData.email,
      name: userData.name,
    };
  }

  private async fetchFacebookProfile(code: string): Promise<{ id: string; email: string; name: string }> {
    const tokenResponse = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        code,
        client_id: process.env.FACEBOOK_APP_ID || '',
        client_secret: process.env.FACEBOOK_APP_SECRET || '',
        redirect_uri: process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/oauth/facebook/callback',
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestException('Failed to exchange Facebook authorization code');
    }

    const tokenData = await fetchJson<FacebookTokenResponse>(tokenResponse);
    const userResponse = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${tokenData.access_token}`);

    if (!userResponse.ok) {
      throw new BadRequestException('Failed to fetch Facebook user profile');
    }

    const userData = await fetchJson<FacebookUserResponse>(userResponse);
    return {
      id: userData.id,
      email: userData.email || `${userData.id}@facebook.user`,
      name: userData.name,
    };
  }

  private async fetchGithubProfile(code: string): Promise<{ id: string; email: string; name: string }> {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        client_id: process.env.GITHUB_CLIENT_ID || '',
        client_secret: process.env.GITHUB_CLIENT_SECRET || '',
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestException('Failed to exchange GitHub authorization code');
    }

    const tokenData = await fetchJson<GithubTokenResponse>(tokenResponse);
    const userResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
    });

    if (!userResponse.ok) {
      throw new BadRequestException('Failed to fetch GitHub user profile');
    }

    const userData = await fetchJson<GithubUserResponse>(userResponse);
    return {
      id: String(userData.id),
      email: userData.email || `${userData.id}@github.user`,
      name: userData.name || userData.login,
    };
  }

  private async fetchAppleProfile(code: string): Promise<{ id: string; email: string; name: string }> {
    const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.APPLE_CLIENT_ID || '',
        client_secret: process.env.APPLE_CLIENT_SECRET || '',
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestException('Failed to exchange Apple authorization code');
    }

    const tokenData = await fetchJson<AppleTokenResponse>(tokenResponse);
    const payload = this.jwtHelper.verifyAccessToken(tokenData.id_token);

    return {
      id: payload.sub,
      email: payload.email || `${payload.sub}@apple.user`,
      name: payload.email?.split('@')[0] || 'Apple User',
    };
  }

  private async fetchTiktokProfile(code: string): Promise<{ id: string; email: string; name: string }> {
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_key: process.env.TIKTOK_CLIENT_KEY || '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestException('Failed to exchange TikTok authorization code');
    }

    const tokenData = await fetchJson<TiktokTokenResponse>(tokenResponse);
    const userResponse = await fetch('https://open.tiktokapis.com/v2/user/info/', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!userResponse.ok) {
      throw new BadRequestException('Failed to fetch TikTok user profile');
    }

    const userData = await fetchJson<TiktokUserResponse>(userResponse);
    const tiktokUser = userData.data?.user ?? {};
    const user: { user_id?: string; open_id?: string; display_name?: string } = tiktokUser;

    return {
      id: user.user_id || user.open_id || '',
      email: `${user.open_id || user.user_id || 'tiktok'}@tiktok.user`,
      name: user.display_name || 'TikTok User',
    };
  }

  private async findOrCreateOAuthUser(provider: string, profile: { id: string; email: string; name: string; username?: string }): Promise<{ id: string; email: string; name: string; username: string; accountType: string; adminRole?: string | null }> {
    const providerFieldMap: Record<string, { field: string }> = {
      google: { field: 'googleId' },
      facebook: { field: 'facebookId' },
      twitter: { field: 'twitterId' },
      github: { field: 'githubId' },
      apple: { field: 'appleId' },
      tiktok: { field: 'tiktokId' },
    };

    const mapping = providerFieldMap[provider];
    if (!mapping) {
      throw new BadRequestException(`Unsupported OAuth provider: ${provider}`);
    }

    let existingUser: { id: string; email: string; name: string; username: string; accountType: string; adminRole?: string | null } | null = null;

    switch (provider) {
      case 'google':
        existingUser = await this.usersRepository.findByGoogleId(profile.id);
        break;
      case 'facebook':
        existingUser = await this.usersRepository.findByFacebookId(profile.id);
        break;
      case 'twitter':
        existingUser = await this.usersRepository.findByTwitterId(profile.id);
        break;
      case 'github':
        existingUser = await this.usersRepository.findByGithubId(profile.id);
        break;
      case 'apple':
        existingUser = await this.usersRepository.findByAppleId(profile.id);
        break;
      case 'tiktok':
        existingUser = await this.usersRepository.findByTiktokId(profile.id);
        break;
      default:
        throw new BadRequestException(`Unsupported OAuth provider: ${provider}`);
    }

    if (existingUser) {
      return existingUser;
    }

    const username = profile.username || profile.email.split('@')[0];
    const baseData: OAuthUserCreateData = {
      email: profile.email,
      name: profile.name,
      username,
      accountType: AccountType.READER,
      passwordHash: null,
      googleId: null,
      facebookId: null,
      twitterId: null,
      githubId: null,
      appleId: null,
      tiktokId: null,
    };

    const createData: OAuthUserCreateData = { ...baseData, [mapping.field]: profile.id };
    const user = await this.usersRepository.create(createData);
    this.eventEmitter.emit('user.registered', new UserRegisteredEvent(user.id, user.email, user.name));

    return user;
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    this.winstonLoggerService.info(`Attempting registration for email: ${dto.email}`, 'AuthService');

    const existingEmail = await this.usersRepository.findByEmail(dto.email);
    if (existingEmail) {
      this.winstonLoggerService.warn(`Registration failed: email ${dto.email} already exists`, 'AuthService');
      throw new ConflictException('Email already exists');
    }

    const existingUsername = await this.usersRepository.findByUsername(dto.username);
    if (existingUsername) {
      this.winstonLoggerService.warn(`Registration failed: username ${dto.username} already exists`, 'AuthService');
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);

    const user = await this.usersRepository.create({
      email: dto.email,
      username: dto.username,
      name: dto.name,
      passwordHash,
      accountType: AccountType.READER,
    });

    this.eventEmitter.emit('user.registered', new UserRegisteredEvent(user.id, user.email, user.name));

    const tokens = await this.generateTokens(user);

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

    const user = await this.usersRepository.findByEmail(dto.email);

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
      const resolvedPayload = await this.jwtHelper.verifyRefreshToken(dto.refreshToken) as JwtPayload;
      if (!resolvedPayload) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const blacklisted = await this.valkeyService.exists(this.REFRESH_TOKEN_BLACKLIST_PREFIX + dto.refreshToken);
      if (blacklisted) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      const user = await this.usersRepository.findById(resolvedPayload.sub);
      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

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
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid session');
    }

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

  private async generateTokens(user: { id: string; email: string; accountType: string; adminRole?: string | null }) {
    const payload = {
      sub: user.id,
      email: user.email,
      accountType: user.accountType,
      adminRole: user.adminRole ?? undefined,
    };

    const accessToken = await this.jwtHelper.generateAccessToken(payload);
    const refreshToken = await this.jwtHelper.generateRefreshToken(payload);
    return { accessToken, refreshToken };
  }
}

interface GoogleTokenResponse {
  access_token: string;
}

interface GoogleUserResponse {
  sub: string;
  email: string;
  name: string;
}

interface FacebookTokenResponse {
  access_token: string;
}

interface FacebookUserResponse {
  id: string;
  email?: string;
  name: string;
}

interface GithubTokenResponse {
  access_token: string;
}

interface GithubUserResponse {
  id: number;
  email?: string;
  name?: string;
  login: string;
}

interface AppleTokenResponse {
  id_token: string;
}

interface TiktokTokenResponse {
  access_token: string;
}

interface TiktokTokenResponse {
  access_token: string;
}

interface TiktokUserResponse {
  data: {
    user: {
      user_id?: string;
      open_id?: string;
      display_name?: string;
    };
  };
}

