import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';

import { RequireMfa } from '../decorators/roles.decorator.ts';
import { Secured } from '../decorators/secured.decorator.ts';
import { ValkeyService } from '../services/valkey.service.ts';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import { AccountRestrictionService } from '../services/account-restriction.service.ts';
import { MfaService } from '../../modules/auth/mfa.service.ts';

import { JwtAuthGuard } from './jwt-auth.guard.ts';
import { MfaGuard } from './mfa.guard.ts';
import { PermissionsGuard } from './permissions.guard.ts';
import { RestrictionGuard } from './restriction.guard.ts';
import { RolesGuard } from './roles.guard.ts';

/**
 * PROVES THAT `@RequireMfa()` MEANS SOMETHING.
 *
 * `MfaGuard` had a full unit suite that passed while it was applied to ZERO routes. It
 * was provided by `CommonModule` and exported, and it was in no `@UseGuards` list
 * anywhere — so every `@RequireMfa()` in the codebase, on the admin break-glass route,
 * on the moderation routes and on the financial routes, was a decoration that did
 * nothing at all. An account with an admin role could reach the routes that ask for a
 * second factor without presenting one.
 *
 * A unit test constructs the guard directly, so it is green by construction no matter
 * how many places call it. THIS suite goes through HTTP and the real `@Secured`
 * composition, so it fails if the guard is absent from `SECURED_GUARDS` — which is the
 * one way for a second-factor control to be inert while every test around it passes.
 */
const JWT_SECRET = 'mfa-wiring-spec-secret-at-least-32-chars';

@Secured()
@Controller('probe')
class MfaProbeController {
  @Get('plain')
  plain(): { ok: true } {
    return { ok: true };
  }

  @RequireMfa()
  @Get('guarded')
  guarded(): { ok: true } {
    return { ok: true };
  }
}

describe('MfaGuard is wired into @Secured', () => {
  let app: INestApplication<Server>;
  let mfaService: {
    shouldEnforceMfa: ReturnType<typeof vi.fn>;
    isMfaEnabled: ReturnType<typeof vi.fn>;
    verifyToken: ReturnType<typeof vi.fn>;
  };

  const tokenFor = (sub: string): Promise<string> =>
    new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email: `${sub}@test.com`, accountType: 'reader' });

  beforeEach(async () => {
    mfaService = {
      shouldEnforceMfa: vi.fn().mockResolvedValue(false),
      isMfaEnabled: vi.fn().mockResolvedValue(false),
      verifyToken: vi.fn().mockResolvedValue({ verified: false }),
    };
    const valkey = { exists: vi.fn().mockResolvedValue(false), get: vi.fn(), set: vi.fn() };
    const winstonLogger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
      log: vi.fn(),
    } as unknown as WinstonLoggerService;

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [MfaProbeController],
      providers: [
        JwtAuthGuard,
        RestrictionGuard,
        RolesGuard,
        PermissionsGuard,
        MfaGuard,
        { provide: MfaService, useValue: mfaService },
        { provide: ValkeyService, useValue: valkey },
        {
          provide: AccountRestrictionService,
          useValue: {
            readCurrentRestriction: vi.fn().mockResolvedValue(null),
            hasActiveBan: vi.fn().mockResolvedValue(false),
          },
        },
        { provide: WinstonLoggerService, useValue: winstonLogger },
        { provide: JwtService, useValue: new JwtService({ secret: JWT_SECRET }) },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('lets an account that does not need a second factor through', async () => {
    const token = await tokenFor('u-1');

    await request(app.getHttpServer()).get('/probe/guarded').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('refuses an account that DOES need one, when the code is not presented', async () => {
    // The account has an admin role, so a second factor is enforced for it, and MFA is
    // enabled on it. The request carries no `X-MFA-Token` — so it must be refused.
    mfaService.shouldEnforceMfa.mockResolvedValue(true);
    mfaService.isMfaEnabled.mockResolvedValue(true);
    const token = await tokenFor('u-2');

    const res = await request(app.getHttpServer())
      .get('/probe/guarded')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect((res.body as { message: string }).message).toContain('MFA challenge required');
  });

  it('refuses an account that needs one and has not enabled it, and says why', async () => {
    mfaService.shouldEnforceMfa.mockResolvedValue(true);
    mfaService.isMfaEnabled.mockResolvedValue(false);
    const token = await tokenFor('u-3');

    const res = await request(app.getHttpServer())
      .get('/probe/guarded')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect((res.body as { message: string }).message).toContain('MFA required for this account');
  });

  it('lets the account through when the code is presented and accepted', async () => {
    mfaService.shouldEnforceMfa.mockResolvedValue(true);
    mfaService.isMfaEnabled.mockResolvedValue(true);
    mfaService.verifyToken.mockResolvedValue({ verified: true, backupCodeUsed: false });
    const token = await tokenFor('u-4');

    await request(app.getHttpServer())
      .get('/probe/guarded')
      .set('Authorization', `Bearer ${token}`)
      .set('X-MFA-Token', '123456')
      .expect(200);

    expect(mfaService.verifyToken).toHaveBeenCalledWith('u-4', '123456');
  });

  it('refuses a code the server will not accept', async () => {
    mfaService.shouldEnforceMfa.mockResolvedValue(true);
    mfaService.isMfaEnabled.mockResolvedValue(true);
    mfaService.verifyToken.mockResolvedValue({ verified: false });
    const token = await tokenFor('u-5');

    await request(app.getHttpServer())
      .get('/probe/guarded')
      .set('Authorization', `Bearer ${token}`)
      .set('X-MFA-Token', '000000')
      .expect(401);
  });

  it('does not ask a route that did not ask for a second factor for one', async () => {
    // The route has no `@RequireMfa()`, so the guard must not read the account at all —
    // the reader is only consulted when the route asked for the reader.
    const token = await tokenFor('u-6');

    await request(app.getHttpServer()).get('/probe/plain').set('Authorization', `Bearer ${token}`).expect(200);

    expect(mfaService.shouldEnforceMfa).not.toHaveBeenCalled();
  });
});
