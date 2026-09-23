import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';

import { UsersService } from './users.service.ts';
import { UsersController } from './controllers/users.controller.ts';
import { UsersRepository } from './repositories/users.repository.ts';
import { USERS_REPOSITORY } from './interfaces/users-repository.interface.ts';
import { UsersEventHandler } from './events/users.event-handler.ts';

@Module({
  imports: [CommonModule],
  controllers: [UsersController],
  providers: [UsersService, { provide: USERS_REPOSITORY, useClass: UsersRepository }, UsersEventHandler],
  exports: [UsersService],
})
export class UsersModule {}
