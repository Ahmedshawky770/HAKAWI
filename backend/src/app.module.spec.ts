import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';

import { AppModule } from './app.module.ts';

/**
 * THE APPLICATION MUST COMPILE.
 *
 * This is the smallest possible statement of the most expensive possible failure:
 * a Nest module graph that cannot be resolved does not start, and the service is
 * down for everyone. Two such failures were live in this repository at once, and
 * neither of them was a test failure — every unit test passed, because the unit
 * tests build their own module and never touched the application's wiring:
 *
 *   · `MfaGuard` was provided by `CommonModule` and injected with `MfaService`,
 *     which lived in `AuthModule` — and `AuthModule` imports `CommonModule`, so the
 *     dependency pointed the wrong way round.
 *   · `AdminRolesService` was provided by `AdminRolesSchedulerModule` and injected
 *     with the repository that `AdminModule` owns — the same wrong way round, and
 *     it also meant the service existed twice.
 *
 * Both were found by the e2e suites, which build the REAL `AppModule` — and the
 * e2e suites could not run, because the application they were trying to build
 * would not compile. So the thing that was broken was the thing that was supposed
 * to report the breaking.
 *
 * WHY A COMPILATION AND NOT A BOOT. `compile()` resolves the whole provider graph
 * — every injection, every token — and it is where a missing dependency is
 * reported. It does not need a database, a broker, or an open port, so it can run
 * in the ordinary unit suite, on every commit, instead of only in an environment
 * that has the infrastructure to run the e2e suites.
 */
describe('the application module', () => {
  it('resolves its whole provider graph', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef).toBeDefined();
  });
});
