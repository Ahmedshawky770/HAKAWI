import { Module } from '@nestjs/common';
import { UserRestrictionsController } from './user-restrictions.controller.js';
import { UserRestrictionsService } from './services/user-restrictions.service.js';
import { USER_RESTRICTIONS_REPOSITORY } from './interfaces/user-restrictions-repository.interface.js';
import { UserRestrictionsRepository } from './repositories/user-restrictions.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [UserRestrictionsController],
  providers: [
    UserRestrictionsService,
    {
      provide: USER_RESTRICTIONS_REPOSITORY,
      useClass: UserRestrictionsRepository,
    },
  ],
  exports: [UserRestrictionsService, USER_RESTRICTIONS_REPOSITORY],
})
export class UserRestrictionsModule {}
