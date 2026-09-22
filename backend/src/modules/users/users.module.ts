import { Module } from '@nestjs/common';
import { UsersService } from './users.service.ts';
import { UsersController } from './controllers/users.controller.ts';
import { UsersRepository } from './repositories/users.repository.ts';

@Module({
  imports: [],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
