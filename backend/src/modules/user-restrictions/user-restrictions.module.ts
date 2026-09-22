import { Module } from '@nestjs/common';
import { UserRestrictionsService } from './services/user-restrictions.service.js';
import { UserRestrictionsController } from './controllers/user-restrictions.controller.js';
import { UserRestrictionsRepository } from './repositories/user-restrictions.repository.js';

@Module({
  imports: [],
  controllers: [UserRestrictionsController],
  providers: [UserRestrictionsService, UserRestrictionsRepository],
  exports: [UserRestrictionsService],
})
export class UserRestrictionsModule {}
