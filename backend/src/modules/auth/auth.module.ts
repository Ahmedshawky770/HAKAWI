import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { CommonModule } from '../../common/common.module.js';
import { GoogleStrategy } from './strategies/google.strategy.js';
import { AppleStrategy } from './strategies/apple.strategy.js';
import { FacebookStrategy } from './strategies/facebook.strategy.js';
import { GithubStrategy } from './strategies/github.strategy.js';
import { TiktokStrategy } from './strategies/tiktok.strategy.js';

@Module({
  imports: [
    CommonModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiry', '15m')! },
      }),
      inject: [ConfigService],
    }),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    AppleStrategy,
    FacebookStrategy,
    GithubStrategy,
    TiktokStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
