import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { WinstonLoggerService } from './services/winston-logger.service.js';
import { ValkeyService } from './services/valkey.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PasswordHasher } from './utils/password.util.js';
import { JwtHelper } from './utils/jwt.util.js';
import { DatabaseModule } from '../db/database.module.js';

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
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiry', '15m')! },
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
  ],
  exports: [WinstonLoggerService, ValkeyService, EventEmitterModule, DatabaseModule, JwtAuthGuard, RolesGuard, JwtModule, PasswordHasher, JwtHelper],
})
export class CommonModule {}