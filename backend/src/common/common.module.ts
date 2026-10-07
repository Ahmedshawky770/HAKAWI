import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard, getOptionsToken, getStorageToken } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import type { StringValue } from 'ms';
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';

import { DatabaseModule } from '../db/database.module.ts';
import appConfig from '../config/app.config.ts';
import databaseConfig from '../config/database.config.ts';
import jwtConfig from '../config/jwt.config.ts';
import throttleConfig, { type ThrottleTier } from '../config/throttle.config.ts';
import valkeyConfig from '../config/valkey.config.ts';
import wafConfig, { type WafConfig } from '../config/waf.config.ts';
import { UsersRepository } from '../modules/users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../modules/users/interfaces/users-repository.interface.ts';

import { WinstonLoggerService } from './services/winston-logger.service.ts';
import { ValkeyService } from './services/valkey.service.ts';
import { EventSchemaRegistry } from './events/event-schema-registry.ts';
import { DLQService } from './events/dlq.service.ts';
import { EventValidatorService } from './events/event-validator.service.ts';
import { JwtAuthGuard } from './guards/jwt-auth.guard.ts';
import { RolesGuard } from './guards/roles.guard.ts';
import { PermissionsGuard } from './guards/permissions.guard.ts';
import { OwnershipGuard } from './guards/ownership.guard.ts';
import { RestrictionGuard } from './guards/restriction.guard.ts';
import { PasswordHasher } from './utils/password.util.ts';
import { JwtHelper, AppleJwksService } from './utils/jwt.util.ts';
import { EncryptionService } from './utils/encryption.util.ts';
import { LoggingInterceptor } from './interceptors/logging.interceptor.ts';
import { CacheInterceptor, CacheMetrics } from './interceptors/cache.interceptor.ts';
import { CacheMetricsController } from './observability/metrics.controller.ts';
import { DLQController } from './events/dlq.controller.ts';
import { WafMiddleware, WAF_CONFIG } from './middleware/waf.middleware.ts';
import { IpBlocklistService } from './waf/ip-blocklist.service.ts';
import { GeoIpService } from './waf/geo-ip.service.ts';
import { ValkeyThrottlerStorage } from './throttler/valkey-throttler.storage.ts';
import { createThrottlerOptions } from './throttler/throttler-options.ts';
import { ResilienceModule } from './resilience/resilience.module.ts';
import { ResilientHttpClient } from './resilience/resilient-http.client.ts';

/**
 * A single `Reflector` shared by the `'REFLECTOR'` provider below and by the throttle
 * `skipIf` predicates, so the tier decision and the guard decisions read identical
 * metadata. `Reflector` is stateless, so sharing one instance is safe.
 *
 * Declared before `@Module` because the provider's `useValue` is evaluated eagerly while
 * the module decorator is being built, not lazily when DI resolves it.
 */
const appReflector = new Reflector();

@Global()
@Module({
  controllers: [CacheMetricsController, DLQController],
  imports: [
    DatabaseModule,
    ResilienceModule,
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),
    ConfigModule.forRoot({
      load: [appConfig, databaseConfig, jwtConfig, valkeyConfig, throttleConfig, wafConfig],
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        // Pinned so the module-level service cannot sign or verify with any other algorithm.
        // JwtHelper passes the same list on every call it owns.
        signOptions: { expiresIn: configService.get<string>('jwt.expiry', '15m') as StringValue, algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const tiers = configService.get<Record<string, ThrottleTier>>('throttle.tiers');
        const trustProxy = configService.get<boolean>('throttle.trustProxy', false);
        const resolved: Record<string, ThrottleTier> = tiers ?? {};
        return {
          throttlers: Object.values(resolved).map((tier) => createThrottlerOptions(tier, trustProxy, appReflector)),
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [
    WinstonLoggerService,
    ValkeyService,
    EventSchemaRegistry,
    DLQService,
    EventValidatorService,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    OwnershipGuard,
    RestrictionGuard,
    PasswordHasher,
    JwtHelper,
    AppleJwksService,
    EncryptionService,
    LoggingInterceptor,
    CacheInterceptor,
    CacheMetrics,
    IpBlocklistService,
    GeoIpService,
    WafMiddleware,
    ResilientHttpClient,
    UsersRepository,
    {
      provide: USERS_REPOSITORY,
      useExisting: UsersRepository,
    },
    {
      provide: WAF_CONFIG,
      useFactory: (configService: ConfigService): WafConfig => {
        const waf = configService.get<WafConfig>('waf');
        if (!waf) {
          throw new Error('WAF configuration is not registered under the "waf" config namespace');
        }
        return waf;
      },
      inject: [ConfigService],
    },
    {
      provide: getStorageToken(),
      useFactory: (valkeyService: ValkeyService, logger: WinstonLoggerService): ValkeyThrottlerStorage =>
        new ValkeyThrottlerStorage(valkeyService, { logger }),
      inject: [ValkeyService, WinstonLoggerService],
    },
    {
      provide: 'APP_GUARD',
      useFactory: (options: ThrottlerModuleOptions, storage: ThrottlerStorage, reflector: Reflector) => {
        return new ThrottlerGuard(options, storage, reflector);
      },
      inject: [getOptionsToken(), getStorageToken(), 'REFLECTOR'],
    },
    {
      // Retained because the e2e suites and `src/test/helpers/test-context.ts` override
      // this exact token to substitute a Reflector; the class token is used everywhere else.
      provide: 'REFLECTOR',
      useValue: appReflector,
    },
  ],
  exports: [
    WinstonLoggerService,
    ValkeyService,
    EventSchemaRegistry,
    DLQService,
    EventValidatorService,
    EventEmitterModule,
    DatabaseModule,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    OwnershipGuard,
    RestrictionGuard,
    JwtModule,
    PasswordHasher,
    JwtHelper,
    AppleJwksService,
    EncryptionService,
    ConfigModule,
    ThrottlerModule,
    USERS_REPOSITORY,
    ResilienceModule,
    LoggingInterceptor,
    CacheInterceptor,
    CacheMetrics,
    IpBlocklistService,
    GeoIpService,
    WafMiddleware,
    ResilientHttpClient,
  ],
})
export class CommonModule {}
