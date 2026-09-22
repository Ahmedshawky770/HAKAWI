import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { USERS_REPOSITORY } from './interfaces/users-repository.interface.js';
import { UsersRepository } from './repositories/users.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { CommonModule } from '../../common/common.module.js';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor.js';

@Module({
  imports: [DatabaseModule, CommonModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    {
      provide: 'CACHE_INTERCEPTOR',
      useClass: CacheInterceptor,
    },
    {
      provide: USERS_REPOSITORY,
      useClass: UsersRepository,
    },
  ],
  exports: [UsersService, USERS_REPOSITORY],
})
export class UsersModule {}
