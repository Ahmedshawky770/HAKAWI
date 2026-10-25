import { Module, forwardRef } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { UsersModule } from '../users/users.module.ts';
import { SharedCacheModule } from '../shared/cache/shared-cache.module.ts';

import { AdminRolesSchedulerModule } from './admin-roles-scheduler.module.ts';
import { AdminWafController } from './admin-waf.controller.ts';
import { AdminRolesController } from './controllers/admin-roles.controller.ts';
import { AdminRolesService } from './services/admin-roles.service.ts';
import { AdminRolesRepository } from './repositories/admin-roles.repository.ts';
import { ADMIN_ROLES_REPOSITORY } from './interfaces/admin-roles-repository.interface.ts';
import { AdminPrivilegedAccessEventHandler } from './events/admin-privileged-access.event-handler.ts';

@Module({
  imports: [CommonModule, SharedCacheModule, forwardRef(() => UsersModule), AdminRolesSchedulerModule],
  controllers: [AdminWafController, AdminRolesController],
  providers: [
    AdminRolesService,
    AdminRolesRepository,
    { provide: ADMIN_ROLES_REPOSITORY, useExisting: AdminRolesRepository },
    // The consumer of the three privileged-access events. Without it the events
    // are registered, validated and delivered — to nobody.
    AdminPrivilegedAccessEventHandler,
  ],
  exports: [AdminRolesService, ADMIN_ROLES_REPOSITORY],
})
export class AdminModule {}