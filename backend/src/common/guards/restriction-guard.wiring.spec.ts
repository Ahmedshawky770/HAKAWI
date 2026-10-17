import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';

import { Public } from '../decorators/roles.decorator.ts';
import { Secured } from '../decorators/secured.decorator.ts';
import { ValkeyService } from '../services/valkey.service.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import { AccountRestrictionService } from '../services/account-restriction.service.ts';

import { JwtAuthGuard } from './jwt-auth.guard.ts';
import { PermissionsGuard } from './permissions.guard.ts';
import { RestrictionGuard } from './restriction.guard.ts';
import { RolesGuard } from './roles.guard.ts';

/**
 * PROVES THE GUARD IS REACHABLE, which no unit test can do.
 *
 * `RestrictionGuard` had a full unit suite that passed while it was applied to zero routes and was
 * registered in neither `CommonModule.providers` nor its exports. A unit test constructs the class
 * directly, so it is green by construction no matter how many places call it — exactly the "false
 * assurance" shape `common/guards/README.md` records for `OwnershipGuard`, and the reason six
 * documents could describe a dead control as live.
 *
 * This suite goes through HTTP and the real `@Secured` composition, so it fails if the guard is not
 * provided, not exported, or absent from `SECURED_GUARDS` — three independent ways for a guard to be
 * inert while its unit tests stay green.
 *
 * WHY THE VALKEY DOUBLE IS STILL HERE. The guard stopped reading Valkey itself when the read moved
 * into `AccountRestrictionService`, which `AuthService` now consumes too — that shared reader is what
 * makes a ban block login instead of only authenticated requests. The double below stands in for that
 * service over the same fake cache, so these cases still describe a real restriction in a real store.
 */
const JWT_SECRET = 'restriction-wiring-spec-secret-at-least-32-chars';

@Secured()
@Controller('probe')
class SecuredProbeController {
  @Get('secured')
  find(): { ok: true } {
    return { ok: true };
  }

  // A real POST, so the read/write split is exercised over HTTP rather than inferred. A `@Get` here
  // would 404 on a POST before any guard ran, which is a 404 the guard never got a chance to prevent.
  @Post('write')
  @HttpCode(HttpStatus.OK)
  write(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Get('public')
  findPublic(): { ok: true } {
    return { ok: true };
  }
}

describe('RestrictionGuard is wired into @Secured', () => {
  let app: INestApplication<Server>;
  let valkey: { exists: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  const tokenFor = (sub: string): Promise<string> =>
    new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email: `${sub}@test.com`, accountType: 'reader' });

  /**
   * The shared reader, wired over the fake cache exactly the way `CommonModule` wires the real one:
   * `AccountRestrictionService` reads Valkey, and `RestrictionGuard` reads the restriction through it.
   * Building it here rather than stubbing it keeps this suite an HTTP test of the real composition.
   */
  const buildRestrictionService = (
    valkeyService: { exists: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> },
    logger: WinstonLoggerService,
  ): AccountRestrictionService => new AccountRestrictionService(valkeyService as unknown as ValkeyService, logger);

  beforeEach(async () => {
    valkey = { exists: vi.fn().mockResolvedValue(false), get: vi.fn(), set: vi.fn() };
    const winstonLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
    } as unknown as WinstonLoggerService;

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [SecuredProbeController],
      providers: [
        JwtAuthGuard,
        RestrictionGuard,
        RolesGuard,
        PermissionsGuard,
        { provide: ValkeyService, useValue: valkey },
        {
          provide: AccountRestrictionService,
          useValue: buildRestrictionService(valkey, winstonLogger),
        },
        {
          provide: WinstonLoggerService,
          useValue: winstonLogger,
        },
        { provide: JwtService, useValue: new JwtService({ secret: JWT_SECRET }) },
        // Registered the way `main.ts` registers it, so the order this test proves is the order that
        // runs in production: JwtAuthGuard populates `request.user`, then RestrictionGuard reads it.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lets an unrestricted account through to the handler', async () => {
    await request(app.getHttpServer())
      .get('/probe/secured')
      .set('Authorization', `Bearer ${await tokenFor('user-1')}`)
      .expect(200);
  });

  it('refuses a BANNED account, which is the entire point of wiring it', async () => {
    valkey.exists.mockResolvedValue(true);
    valkey.get.mockResolvedValue('ban');

    await request(app.getHttpServer())
      .get('/probe/secured')
      .set('Authorization', `Bearer ${await tokenFor('user-1')}`)
      .expect(HttpStatus.FORBIDDEN);
  });

  it('answers 401 before the guard runs, because JwtAuthGuard is first in the chain', async () => {
    await request(app.getHttpServer()).get('/probe/secured').expect(HttpStatus.UNAUTHORIZED);
    expect(valkey.exists).not.toHaveBeenCalled();
  });

  it('leaves a @Public() route reachable for a banned account', async () => {
    // `@Public()` returns from JwtAuthGuard and therefore from the whole composed chain, so a banned
    // account can still read public content. That is the intended behaviour: a ban stops account
    // access, it does not make the public site disappear — and the routes that MINT a session are
    // `@Public()` too, which is exactly why `AuthService` refuses a banned account at login, refresh
    // and OAuth through the same cache read this guard makes, rather than relying on this guard.
    valkey.exists.mockResolvedValue(true);
    valkey.get.mockResolvedValue('ban');

    await request(app.getHttpServer()).get('/probe/public').expect(200);
  });

  it('lets a muted account read but not write, over real HTTP', async () => {
    valkey.exists.mockResolvedValue(true);
    valkey.get.mockResolvedValue('mute');

    await request(app.getHttpServer())
      .get('/probe/secured')
      .set('Authorization', `Bearer ${await tokenFor('user-1')}`)
      .expect(200);

    valkey.exists.mockClear();
    await request(app.getHttpServer())
      .post('/probe/write')
      .set('Authorization', `Bearer ${await tokenFor('user-1')}`)
      .expect(HttpStatus.LOCKED);
  });
});
