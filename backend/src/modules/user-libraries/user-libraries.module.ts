import { Module } from '@nestjs/common';
import { UserLibrariesController } from './user-libraries.controller.js';
import { UserLibrariesService } from './services/user-libraries.service.js';
import { USER_LIBRARIES_REPOSITORY } from './interfaces/user-libraries-repository.interface.js';
import { UserLibrariesRepository } from './repositories/user-libraries.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [UserLibrariesController],
  providers: [
    UserLibrariesService,
    {
      provide: USER_LIBRARIES_REPOSITORY,
      useClass: UserLibrariesRepository,
    },
  ],
  exports: [UserLibrariesService, USER_LIBRARIES_REPOSITORY],
})
export class UserLibrariesModule {}
