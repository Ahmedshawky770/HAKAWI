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
import valkeyConfig from '../config/valkey.config.ts';
import { UsersRepository } from '../modules/users/repositories/users.repository.ts';
import { USERS_REPOSITORY } from '../modules/users/interfaces/users-repository.interface.ts';

import { WinstonLoggerService } from './services/winston-logger.service.ts';
import { ValkeyService } from './services/valkey.service.ts';
import { JwtAuthGuard } from './guards/jwt-auth.guard.ts';
import { RolesGuard } from './guards/roles.guard.ts';
import { PasswordHasher } from './utils/password.util.ts';
import { JwtHelper } from './utils/jwt.util.ts';

@Global()
@Module({
  imports: [
    DatabaseModule,
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),
    ConfigModule.forRoot({
      load: [appConfig, databaseConfig, jwtConfig, valkeyConfig],
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiry', '15m') as StringValue },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('app.throttler.ttl', 60000),
            limit: configService.get<number>('app.throttler.limit', 10),
          },
        ],
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    WinstonLoggerService,
    ValkeyService,
    JwtAuthGuard,
    RolesGuard,
    PasswordHasher,
    JwtHelper,
    UsersRepository,
    {
      provide: USERS_REPOSITORY,
      useExisting: UsersRepository,
    },
    {
      provide: 'APP_GUARD',
      useFactory: (options: ThrottlerModuleOptions, storage: ThrottlerStorage, reflector: Reflector) => {
        return new ThrottlerGuard(options, storage, reflector);
      },
      inject: [getOptionsToken(), getStorageToken(), 'REFLECTOR'],
    },
    {
      provide: 'REFLECTOR',
      useValue: new Reflector(),
    },
  ],
  exports: [WinstonLoggerService, ValkeyService, EventEmitterModule, DatabaseModule, JwtAuthGuard, RolesGuard, JwtModule, PasswordHasher, JwtHelper, ConfigModule, ThrottlerModule, USERS_REPOSITORY],
})
export class CommonModule {}
