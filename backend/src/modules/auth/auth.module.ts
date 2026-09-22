import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.ts';
import { AuthController } from './auth.controller.ts';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module.ts';
import { JwtStrategy } from './strategies/jwt.strategy.ts';
import { CommonModule } from '../../common/common.module.ts';
import { GoogleStrategy } from './strategies/google.strategy.ts';
import { AppleStrategy } from './strategies/apple.strategy.ts';
import { FacebookStrategy } from './strategies/facebook.strategy.ts';
import { GithubStrategy } from './strategies/github.strategy.ts';
import { TiktokStrategy } from './strategies/tiktok.strategy.ts';

@Module({
  imports: [
    CommonModule,
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      global: true,
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
