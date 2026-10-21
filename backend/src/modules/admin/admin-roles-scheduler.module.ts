import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

/**
 * THE SCHEDULER, AND NOTHING ELSE.
 *
 * This module used to provide `AdminRolesService` as well, and that was the second
 * half of the application's refusal to start:
 *
 *   "Nest can't resolve dependencies of the AdminRolesService (?, WinstonLoggerService,
 *    EventValidatorService, UsersService, ConfigService). Please make sure that the
 *    argument "ADMIN_ROLES_REPOSITORY" at index [0] is available in the
 *    AdminRolesSchedulerModule module."
 *
 * The repository is provided by `AdminModule`, and `AdminModule` imports this module
 * — so the dependency pointed the wrong way round, exactly as it did for `MfaService`
 * and `MfaGuard`.
 *
 * And it was not only a boot failure: the service was provided TWICE — once here and
 * once in `AdminModule` — and the copy here is the one that carries the `@Cron`. So
 * the nightly expiry sweep would have run against a second instance of the service,
 * outside the module that owns its repository.
 *
 * WHAT THE MODULE IS FOR. `ScheduleModule.forRoot()` registers the scheduler; the
 * `@Cron` method on `AdminRolesService` is then discovered across the application, and
 * the service is provided — once — by `AdminModule`, which owns its repository. So
 * this module's only job is to switch the scheduler on, and the name says whose
 * schedule it is there to run.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
})
export class AdminRolesSchedulerModule {}
