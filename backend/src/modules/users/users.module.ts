import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';

import { UsersService } from './users.service.ts';
import { UsersController } from './controllers/users.controller.ts';
import { UsersEventHandler } from './events/users.event-handler.ts';

@Module({
  imports: [CommonModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UsersEventHandler,
  ],
  exports: [UsersService],
})
export class UsersModule {}
