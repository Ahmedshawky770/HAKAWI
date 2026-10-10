import crypto from 'crypto';

import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ZodType } from 'zod';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { PasswordHasher } from '../../common/utils/password.util.ts';
import { JwtHelper, JwtPayload, AppleJwksService, fingerprintToken } from '../../common/utils/jwt.util.ts';
import { fetchJson, type FetchJsonOptions } from '../../common/utils/fetch.util.ts';
import { EncryptionService } from '../../common/utils/encryption.util.ts';
import { AccountType } from '../../common/constants/roles.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { CircuitBreakerService } from '../../common/resilience/circuit-breaker.service.js';
import { USERS_REPOSITORY, type CreateUserInput } from '../../common/users/users-repository.interface.ts';
import type { IUsersRepository } from '../../common/users/users-repository.interface.ts';
import { UserRegisteredEvent } from '../../common/events/users.events.ts';
import { EmailVerificationService } from '../email-verification/email-verification.service.ts';
import { AccountLockoutService, LockoutStatus } from './account-lockout.service.ts';

import {
  appleTokenResponseSchema,
  facebookTokenResponseSchema,
  facebookUserResponseSchema,
  githubTokenResponseSchema,
  githubUserResponseSchema,
  googleTokenResponseSchema,
  googleUserResponseSchema,
  tiktokTokenResponseSchema,
  tiktokUserResponseSchema,
  type OAuthProfile,
} from './types/oauth.schemas.ts';
import { isOAuthProvider, OAUTH_PROVIDER_ID_FIELD } from './types/oauth.types.ts';
import { resolveOAuthEmail } from './utils/oauth-email.util.ts';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  AuthResponseDto,
  SessionResponseDto,
  LogoutResponseDto,
} from './dto/auth.dto.ts';

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * `crypto.timingSafeEqual` throws on a length mismatch, and the length of a secret is itself
 * information — so the lengths are compared first and the result folded in. An unequal length
 * short-circuits, which is unavoidable with this primitive; what it removes is the per-byte
 * early exit that `===` performs on a value of the same length.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

const OAUTH_REQUEST_TIMEOUT_MS = 8000;
const TIKTOK_OK = 0;
const DEFAULT_REFRESH_EXPIRY = '7d';

/**
 * Parse a duration string such as `15m`, `7d`, `30d`, `900` or `2h` into milliseconds.
 *
 * Deliberately not a general parser: it accepts the unit forms a JWT `expiresIn` is written in
 * and returns `null` for anything else, so the caller has to decide what to do about a value it
 * does not understand rather than silently getting a wrong number.
 */
export function parseDurationToMs(duration: string): number | null {
  const match = /^(\d+)\s*(ms|s|m|h|d|w|y)?$/i.exec(duration.trim());
  if (match === null) {
    return null;
  }
  const amount = Number.parseInt(match[1] as string, 10);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  const unit = (match[2] ?? 's').toLowerCase();
  const multipliers: Readonly<Record<string, number>> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    y: 31_557_600_000,
  };
  return amount * (multipliers[unit] ?? 1000);
}

@Injectable()
export class AuthService {
  private readonly REFRESH_TOKEN_BLACKLIST_PREFIX = 'refresh_token:blacklist:';
  private readonly REFRESH_TOKEN_USER_BLACKLIST_PREFIX = 'refresh_token:blacklist:user:';
  private readonly OAUTH_STATE_PREFIX = 'oauth:state:';
  private readonly OAUTH_STATE_TTL_SECONDS = 600;

  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: IUsersRepository,
    @Inject(PasswordHasher) private readonly passwordHasher: PasswordHasher,
    @Inject(JwtHelper) private readonly jwtHelper: JwtHelper,
    @Inject(ValkeyService) private readonly valkeyService: ValkeyService,
    @Inject(WinstonLoggerService) private readonly winstonLoggerService: WinstonLoggerService,
    @Inject(CircuitBreakerService) private readonly circuitBreaker: CircuitBreakerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    @Inject(EmailVerificationService) private readonly emailVerificationService: EmailVerificationService,
    @Inject(EncryptionService) private readonly encryptionService: EncryptionService,
    @Inject(AppleJwksService) private readonly appleJwks: AppleJwksService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(AccountLockoutService) private readonly accountLockout: AccountLockoutService,
  ) {}

  async getAuthorizationUrl(provider: string, state?: string): Promise<string> {
    if (!isOAuthProvider(provider)) {
      throw new BadRequestException(`Unsupported OAuth provider: ${provider}`);
    }

    const stateToken = state || this.generateState();
    // WHY this is awaited and not `void`-ed: this write is the CSRF defence for the entire OAuth
    // flow, and the callback reads it. Fired without awaiting, the callback could arrive before
    // the write landed and a legitimate sign-in would fail with a state mismatch; a Valkey
    // failure also became an unhandled rejection rather than an error the caller could see.
    await this.valkeyService.set(this.OAUTH_STATE_PREFIX + stateToken, provider, this.OAUTH_STATE_TTL_SECONDS);

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
      default: {
        // WHY the widened local: `isOAuthProvider` above proved this case unreachable, so the
        // compiler narrows `provider` to `never` here and refuses it inside a template. The branch
        // is kept so a provider added to `OAUTH_PROVIDERS` without a builder fails loudly instead
        // of returning nothing.
        const unsupported: string = provider;
        throw new BadRequestException(`Unsupported OAuth provider: ${unsupported}`);
      }
    }
  }

  async handleOAuthCallback(
    provider: string,
    code: string,
    state?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!isOAuthProvider(provider)) {
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

    const profile = await this.circuitBreaker.execute(`oauth-${provider}`, () =>
      this.fetchProviderProfile(provider, code),
    );
    const user = await this.findOrCreateOAuthUser(provider, profile);

    return this.generateTokens(user);
  }

  private generateState(): string {
    return crypto.randomUUID();
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

  private async fetchProviderProfile(provider: string, code: string): Promise<OAuthProfile> {
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

  private async fetchGoogleProfile(code: string): Promise<OAuthProfile> {
    const tokenData = await this.fetchOAuthJson(
      'https://oauth2.googleapis.com/token',
      googleTokenResponseSchema,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID || '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          redirect_uri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/oauth/google/callback',
          grant_type: 'authorization_code',
        }).toString(),
        operation: 'google:token',
      },
      'Failed to exchange Google authorization code',
    );

    const userData = await this.fetchOAuthJson(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      googleUserResponseSchema,
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        operation: 'google:userinfo',
      },
      'Failed to fetch Google user profile',
    );

    return {
      id: userData.sub,
      email: resolveOAuthEmail(userData.email, 'google', userData.sub),
      name: userData.name?.trim() || 'Google User',
    };
  }

  private async fetchFacebookProfile(code: string): Promise<OAuthProfile> {
    const tokenData = await this.fetchOAuthJson(
      `https://graph.facebook.com/v18.0/oauth/access_token?${new URLSearchParams({
        code,
        client_id: process.env.FACEBOOK_APP_ID || '',
        client_secret: process.env.FACEBOOK_APP_SECRET || '',
        redirect_uri: process.env.FACEBOOK_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/oauth/facebook/callback',
      }).toString()}`,
      facebookTokenResponseSchema,
      { headers: { Accept: 'application/json' }, operation: 'facebook:token' },
      'Failed to exchange Facebook authorization code',
    );

    const userData = await this.fetchOAuthJson(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(tokenData.access_token)}`,
      facebookUserResponseSchema,
      { headers: { Accept: 'application/json' }, operation: 'facebook:profile' },
      'Failed to fetch Facebook user profile',
    );

    return {
      id: userData.id,
      email: resolveOAuthEmail(userData.email, 'facebook', userData.id),
      name: userData.name?.trim() || 'Facebook User',
    };
  }

  private async fetchGithubProfile(code: string): Promise<OAuthProfile> {
    const tokenData = await this.fetchOAuthJson(
      'https://github.com/login/oauth/access_token',
      githubTokenResponseSchema,
      {
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
        operation: 'github:token',
      },
      'Failed to exchange GitHub authorization code',
    );

    const userData = await this.fetchOAuthJson(
      'https://api.github.com/user',
      githubUserResponseSchema,
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
        operation: 'github:user',
      },
      'Failed to fetch GitHub user profile',
    );

    return {
      id: String(userData.id),
      email: resolveOAuthEmail(userData.email, 'github', String(userData.id)),
      name: userData.name?.trim() || userData.login,
      username: userData.login,
    };
  }

  private async fetchAppleProfile(code: string): Promise<OAuthProfile> {
    const tokenData = await this.fetchOAuthJson(
      'https://appleid.apple.com/auth/token',
      appleTokenResponseSchema,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.APPLE_CLIENT_ID || '',
          client_secret: process.env.APPLE_CLIENT_SECRET || '',
          grant_type: 'authorization_code',
        }).toString(),
        operation: 'apple:token',
      },
      'Failed to exchange Apple authorization code',
    );

    const payload = await this.jwtHelper.verifyAppleIdToken(tokenData.id_token, this.appleJwks);

    return {
      id: payload.sub,
      email: resolveOAuthEmail(payload.email, 'apple', payload.sub),
      name: payload.email?.split('@')[0] || 'Apple User',
    };
  }

  private async fetchTiktokProfile(code: string): Promise<OAuthProfile> {
    const tokenData = await this.fetchOAuthJson(
      'https://open.tiktokapis.com/v2/oauth/token/',
      tiktokTokenResponseSchema,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_key: process.env.TIKTOK_CLIENT_KEY || '',
          client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
          grant_type: 'authorization_code',
        }).toString(),
        operation: 'tiktok:token',
      },
      'Failed to exchange TikTok authorization code',
    );

    const userData = await this.fetchOAuthJson(
      'https://open.tiktokapis.com/v2/user/info/',
      tiktokUserResponseSchema,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        operation: 'tiktok:user',
      },
      'Failed to fetch TikTok user profile',
    );

    if (userData.code !== TIKTOK_OK) {
      this.winstonLoggerService.warn(
        `TikTok user info reported code ${userData.code}: ${userData.message ?? 'no message'}`,
        'AuthService',
      );
      throw new BadRequestException('Failed to fetch TikTok user profile');
    }

    const user = userData.data?.user ?? {};
    const id = user.user_id || user.open_id || '';

    return {
      id,
      // WHY an explicit absent: TikTok's userinfo endpoint has no email field at all, so the
      // address is always the placeholder. It goes through the shared resolver so the derived
      // domain lives in one place instead of being spelled out here.
      email: resolveOAuthEmail(undefined, 'tiktok', id || 'tiktok'),
      name: user.display_name?.trim() || 'TikTok User',
    };
  }

  private async fetchOAuthJson<T>(
    url: string,
    schema: ZodType<T>,
    options: FetchJsonOptions,
    failureMessage: string,
  ): Promise<T> {
    try {
      return await fetchJson(url, schema, { timeoutMs: OAUTH_REQUEST_TIMEOUT_MS, ...options });
    } catch (error) {
      this.winstonLoggerService.warn(
        `OAuth call ${options.operation ?? url} failed: ${error instanceof Error ? error.message : String(error)}`,
        'AuthService',
      );
      throw new BadRequestException(failureMessage);
    }
  }

  private async findOrCreateOAuthUser(
    provider: string,
    profile: OAuthProfile,
  ): Promise<{
    id: string;
    email: string;
    name: string;
    username: string;
    accountType: string;
    adminRole?: string | null;
  }> {
    if (!isOAuthProvider(provider)) {
      throw new BadRequestException(`Unsupported OAuth provider: ${provider}`);
    }

    let existingUser: {
      id: string;
      email: string;
      name: string;
      username: string;
      accountType: string;
      adminRole?: string | null;
      /** The schema allows null for rows written before the column existed; null means not blocked. */
      accessBlocked: boolean | null;
    } | null = null;

    switch (provider) {
      case 'google':
        existingUser = await this.usersRepository.findByGoogleId(profile.id);
        break;
      case 'facebook':
        existingUser = await this.usersRepository.findByFacebookId(profile.id);
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
      default: {
        const unsupported: string = provider;
        throw new BadRequestException(`Unsupported OAuth provider: ${unsupported}`);
      }
    }

    if (existingUser) {
      // WHY this check: OAuth is a front door, and it was the one front door with no ban check.
      // A user blocked by an administrator could sign in again through any of the five
      // providers, because the lookup returned the account and minted tokens without ever
      // looking at `accessBlocked`. `login` has refused a blocked account since the flag
      // existed; this closes the equivalent hole on the OAuth path.
      if (existingUser.accessBlocked) {
        this.winstonLoggerService.warn(
          `OAuth sign-in refused: account disabled (user ${existingUser.id}, provider ${provider})`,
          'AuthService',
        );
        throw new UnauthorizedException('Account has been disabled');
      }
      return existingUser;
    }

    const username = profile.username || profile.email.split('@')[0];
    const baseData: CreateUserInput = {
      email: profile.email,
      name: profile.name,
      username,
      accountType: AccountType.READER,
      passwordHash: null,
      googleId: null,
      facebookId: null,
      githubId: null,
      appleId: null,
      tiktokId: null,
    };

    const createData: CreateUserInput = { ...baseData, [OAUTH_PROVIDER_ID_FIELD[provider]]: profile.id };
    const user = await this.usersRepository.create(createData);
    await this.eventBus.emit('user.registered', new UserRegisteredEvent(user.id, user.email, user.name));

    return user;
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    this.winstonLoggerService.info('Attempting registration for a new user', 'AuthService');

    const existingEmail = await this.usersRepository.findByEmail(dto.email);
    if (existingEmail) {
      this.winstonLoggerService.warn('Registration failed: email already exists', 'AuthService');
      throw new ConflictException('Email already exists');
    }

    const existingUsername = await this.usersRepository.findByUsername(dto.username);
    if (existingUsername) {
      this.winstonLoggerService.warn('Registration failed: username already exists', 'AuthService');
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

    await this.eventBus.emit('user.registered', new UserRegisteredEvent(user.id, user.email, user.name));

    await this.emailVerificationService.generateToken(dto.email);

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

  async login(dto: LoginDto, clientIp: string): Promise<AuthResponseDto> {
    this.winstonLoggerService.info('Login attempt for a user', 'AuthService');

    // Check if account is locked before attempting login
    const lockoutStatus = await this.accountLockout.checkStatus(null, clientIp);
    if (lockoutStatus.isLocked) {
      this.winstonLoggerService.warn(
        `Login blocked: IP ${clientIp} is locked out`,
        'AuthService',
      );
      throw new UnauthorizedException(
        `Too many failed attempts. Please try again after ${Math.ceil(
          (lockoutStatus.lockoutExpiresAt! - Date.now()) / 60000,
        )} minutes.`,
      );
    }

    const user = await this.usersRepository.findByEmail(dto.email);

    if (!user || !user.passwordHash) {
      this.winstonLoggerService.warn('Login failed: invalid credentials', 'AuthService');
      await this.accountLockout.recordFailedAttempt(null, clientIp);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check user-specific lockout
    const userLockoutStatus = await this.accountLockout.checkStatus(user.id, clientIp);
    if (userLockoutStatus.isLocked) {
      this.winstonLoggerService.warn(
        `Login blocked: user ${user.id} is locked out`,
        'AuthService',
      );
      throw new UnauthorizedException(
        `Account temporarily locked due to too many failed attempts. Please try again after ${Math.ceil(
          (userLockoutStatus.lockoutExpiresAt! - Date.now()) / 60000,
        )} minutes.`,
      );
    }

    const isPasswordValid = await this.passwordHasher.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      this.winstonLoggerService.warn('Login failed: invalid password', 'AuthService');
      await this.accountLockout.recordFailedAttempt(user.id, clientIp);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.accessBlocked) {
      this.winstonLoggerService.warn('Login failed: account disabled', 'AuthService');
      throw new UnauthorizedException('Account has been disabled');
    }

    // Clear lockout on successful login
    await this.accountLockout.clearOnSuccess(user.id, clientIp);

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
    // WHY this guard: the controller fills the field from the httpOnly cookie *or* the body, so
    // an absent token is a routine client state (no cookie, no body) and not a server fault. It
    // has to be refused explicitly, because handing `undefined` to the verifier throws a TypeError
    // from deep inside jsonwebtoken, which the catch below would report as a 401 for the wrong
    // reason and an operator could never tell the two apart.
    const presentedToken = this.readPresentedRefreshToken(dto.refreshToken);
    if (presentedToken === undefined) {
      this.winstonLoggerService.warn(
        'Refresh attempted without a refresh token in the cookie or the body',
        'AuthService',
      );
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: JwtPayload & { type: string };
    try {
      payload = await this.jwtHelper.verifyRefreshToken(presentedToken);
      if (!payload) {
        throw new UnauthorizedException('Invalid refresh token');
      }
    } catch (error) {
      this.winstonLoggerService.warn('Refresh token validation failed', 'AuthService');
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (await this.valkeyService.exists(this.REFRESH_TOKEN_BLACKLIST_PREFIX + fingerprintToken(presentedToken))) {
      this.winstonLoggerService.warn(
        'Refresh token reuse detected, the presented token was already revoked',
        'AuthService',
      );
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Check user-level blacklist (set on password reset, account disable, etc.)
    if (await this.valkeyService.exists(this.REFRESH_TOKEN_USER_BLACKLIST_PREFIX + payload.sub)) {
      this.winstonLoggerService.warn(
        `Refresh refused: all tokens for user ${payload.sub} have been revoked (password reset or admin action)`,
        'AuthService',
      );
      throw new UnauthorizedException('Session has been revoked. Please log in again.');
    }

    const user = await this.usersRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // WHY this check is here and not only in `login`: refresh is silent and cookie-driven, so a
    // user blocked while holding a valid refresh token would otherwise keep minting access
    // tokens for the full lifetime of the refresh token — up to 7 days — with no login, no
    // password check and no event in the log. A ban that a user can walk out of by waiting is
    // not a ban.
    if (user.accessBlocked) {
      this.winstonLoggerService.warn(`Refresh refused: account disabled (user ${user.id})`, 'AuthService');
      await this.revokeRefreshToken(presentedToken, user.id);
      throw new UnauthorizedException('Account has been disabled');
    }

    // WHY the order: the previous token is burned *before* the replacement is minted. Issuing
    // first left a window in which two concurrent refreshes of the same cookie both passed the
    // reuse check and both returned a live pair, so a single stolen cookie could be replayed
    // forever. Burning first narrows that to a real race on the Valkey round trip and makes the
    // reuse case fail closed: if minting then fails, the user re-authenticates instead of keeping
    // a token nobody can revoke.
    await this.revokeRefreshToken(presentedToken, payload.sub);

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
  }

  /**
   * Returns the refresh token to act on, or `undefined` when the caller supplied nothing usable.
   * A cookie is sometimes sent with an empty value by a browser that has just had it cleared, so
   * "present" has to mean "has content", not merely "is defined".
   */
  private readPresentedRefreshToken(candidate: string | undefined): string | undefined {
    if (typeof candidate !== 'string') {
      return undefined;
    }
    const trimmed = candidate.trim();
    return trimmed.length > 0 ? trimmed : undefined;
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

  async logout(refreshToken: string | undefined): Promise<LogoutResponseDto> {
    // The same "present means has content" rule as refreshTokens, so the two endpoints that revoke
    // the same token cannot disagree about whether one was supplied.
    const presentedToken = this.readPresentedRefreshToken(refreshToken);
    if (presentedToken === undefined) {
      // WHY the distinct wording: this path revoked nothing, so the previous "Logged out
      // successfully" was a claim about a security effect that did not happen — it read in a log
      // review as "the session was killed" when the token may still be live. The client contract
      // is deliberately unchanged (HTTP 200 with a `message`), because a logout that errors is
      // worse for the user than a logout that cannot revoke (Principle #8), and the warning is
      // where the "no token presented" signal belongs.
      this.winstonLoggerService.warn(
        'Logout requested with no refresh token, nothing was revoked; the presented session may still be live',
        'AuthService',
      );
      return { message: 'Logged out, but no session token was presented to revoke' };
    }

    let payload: JwtPayload & { type: string };
    try {
      payload = await this.jwtHelper.verifyRefreshToken(presentedToken);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.revokeRefreshToken(presentedToken, payload.sub);

    return {
      message: 'Logged out successfully',
    };
  }

  private async revokeRefreshToken(refreshToken: string, userId: string): Promise<void> {
    // WHY a hash of the token and not the token: a Valkey key is not a secret store. It is
    // written to RDB and AOF dumps, appears in MONITOR and SLOWLOG output, in SCAN results and
    // in every replica. With the raw token as the key, any read path over any of those yields
    // directly usable refresh tokens. The blacklist only ever asks "have I seen this exact token
    // before?", which a sha256 answers just as well.
    const ttlSeconds = this.refreshBlacklistTtlSeconds();
    await this.valkeyService.set(
      this.REFRESH_TOKEN_BLACKLIST_PREFIX + fingerprintToken(refreshToken),
      'revoked',
      ttlSeconds,
    );

    this.winstonLoggerService.info(`Refresh token blacklisted for user: ${userId}`, 'AuthService');
  }

  /**
   * How long a revoked refresh token must stay on the blacklist.
   *
   * Derived from `jwt.refreshExpiry` rather than hardcoded. It used to be a literal 7 days
   * while the token lifetime came from configuration, so an operator who set
   * `REFRESH_TOKEN_EXPIRY=30d` got a blacklist entry that expired on day 7: a token revoked at
   * logout became usable again from day 7 onwards, for another 23 days. The TTL has to be at
   * least the token's own remaining lifetime, so it is computed from the same value.
   */
  private refreshBlacklistTtlSeconds(): number {
    const configured = this.configService.get<string>('jwt.refreshExpiry', '7d');
    const lifetimeMs = parseDurationToMs(configured);
    if (lifetimeMs === null) {
      // An unparseable duration is a configuration error. Falling back to the documented default
      // keeps the blacklist at least as long as the token for every duration Hakawi ships with,
      // and the config layer is where an invalid value is reported.
      this.winstonLoggerService.warn(
        `Could not parse jwt.refreshExpiry="${configured}"; using ${DEFAULT_REFRESH_EXPIRY} for the blacklist TTL. ` +
          'A blacklist shorter than the token lifetime would let a revoked token become valid again.',
        'AuthService',
      );
      return Math.ceil((parseDurationToMs(DEFAULT_REFRESH_EXPIRY) ?? 0) / 1000);
    }
    return Math.ceil(lifetimeMs / 1000);
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

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      return;
    }

    const resetToken = crypto.randomUUID();
    const encryptedToken = this.encryptionService.encrypt(resetToken);

    await this.usersRepository.update(user.id, {
      passwordResetToken: encryptedToken,
    });

    await this.valkeyService.set(`password:reset:${resetToken}`, user.id, 3600);
    await this.eventBus.emit('password.reset.requested', { userId: user.id, email: user.email });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await this.valkeyService.get(`password:reset:${token}`);
    if (!userId) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.usersRepository.findById(userId);
    if (!user || !user.passwordResetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    try {
      const decryptedToken = this.encryptionService.decrypt(user.passwordResetToken);
      // Constant-time comparison. `!==` on a secret returns as soon as two bytes differ, which
      // is a measurable signal; `timingSafeEqual` is the standard answer and costs one line.
      if (!timingSafeEqualStrings(decryptedToken, token)) {
        throw new BadRequestException('Invalid or expired reset token');
      }
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    await this.usersRepository.update(userId, { passwordHash, passwordResetToken: null });
    await this.valkeyService.del(`password:reset:${token}`);

    // Invalidate all refresh tokens for this user (password reset = session revocation)
    const userBlacklistKey = this.REFRESH_TOKEN_USER_BLACKLIST_PREFIX + userId;
    const refreshTokenTtlSeconds = this.refreshBlacklistTtlSeconds();
    await this.valkeyService.set(userBlacklistKey, 'revoked', refreshTokenTtlSeconds);

    this.winstonLoggerService.info(
      `All refresh tokens revoked for user ${userId} due to password reset`,
      'AuthService',
    );

    await this.eventBus.emit('password.reset.completed', { userId });
  }
}
