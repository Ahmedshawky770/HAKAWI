import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../db/database.module.ts';
import { CommonModule } from '../../common/common.module.ts';
import { SharedCacheModule } from '../shared/cache/shared-cache.module.ts';

import { UsersService } from './users.service.ts';
import { UsersController } from './controllers/users.controller.ts';
import { UsersEventHandler } from './events/users.event-handler.ts';
import { UserVerificationService } from './services/user-verification.service.ts';
import { UsersRepository } from './repositories/users.repository.ts';
import { USERS_REPOSITORY } from './interfaces/users-repository.interface.ts';

@Module({
  imports: [CommonModule, DatabaseModule, SharedCacheModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserVerificationService,
    UsersRepository,
    UsersEventHandler,
    { provide: USERS_REPOSITORY, useExisting: UsersRepository },
  ],
  exports: [UsersService, UserVerificationService, USERS_REPOSITORY],
})
export class UsersModule {}
