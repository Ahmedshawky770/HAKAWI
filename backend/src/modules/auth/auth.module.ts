import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { CommonModule } from '../../common/common.module.ts';
import { USERS_REPOSITORY } from '../users/interfaces/users-repository.interface.ts';
import { UsersRepository } from '../users/repositories/users.repository.ts';

import { JwtStrategy } from './strategies/jwt.strategy.ts';
import { AuthController } from './auth.controller.ts';
import { AuthService } from './auth.service.ts';

@Module({
  imports: [
    CommonModule,
    PassportModule,
    EventEmitterModule,
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: USERS_REPOSITORY, useClass: UsersRepository },
  ],
  exports: [AuthService],
})
export class AuthModule {}
