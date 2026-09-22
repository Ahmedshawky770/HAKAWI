import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { WinstonLoggerService } from './services/winston-logger.service.ts';
import { ValkeyService } from './services/valkey.service.ts';
import { JwtAuthGuard } from './guards/jwt-auth.guard.ts';
import { RolesGuard } from './guards/roles.guard.ts';
import { PasswordHasher } from './utils/password.util.ts';
import { JwtHelper } from './utils/jwt.util.ts';
import { DatabaseModule } from '../db/database.module.ts';

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