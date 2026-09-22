import { Module } from '@nestjs/common';
import { UsersService } from './services/users.service.js';
import { UsersController } from './controllers/users.controller.js';
import { UsersRepository } from './repositories/users.repository.js';

@Module({
  imports: [],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
