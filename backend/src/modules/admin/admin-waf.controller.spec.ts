import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { RolesGuard } from '../../common/guards/roles.guard.ts';
import { AdminRole } from '../../common/constants/roles.ts';
import { IpBlocklistService, type BlockRecord, type BlockOptions } from '../../common/waf/ip-blocklist.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import { AdminWafController } from './admin-waf.controller.ts';

type IpBlocklistServiceMock = {
  listBlocked: ReturnType<typeof vi.fn<() => Promise<BlockRecord[]>>>;
  block: ReturnType<typeof vi.fn<(ip: string, options: BlockOptions) => Promise<boolean>>>;
  unblock: ReturnType<typeof vi.fn<(ip: string) => Promise<boolean>>>;
};

/**
 * The super-admin principal the fake `JwtAuthGuard` writes onto the request.
 *
 * WHY THE FAKE POPULATES `request.user` INSTEAD OF ONLY ANSWERING `true`. The real defect on this
 * controller was that `@RequireAdminRole` set metadata with no `RolesGuard` in
 * `@UseGuards` to read it, so EVERY authenticated caller reached every handler. `RolesGuard` decides
 * from `request.user`, so a stub that answers `true` and leaves the request bare would have kept the
 * suite green through the exact bug it exists to catch — it would now be a 403 from `RolesGuard`,
 * which is the same outcome the bug had. Populating the identity means the real `RolesGuard` runs
 * against a real principal and the tests below are the ones that fail if the enforcement is removed.
 */
const SUPER_ADMIN_PRINCIPAL = {
  sub: 'root-1',
  accountType: 'admin' as const,
  adminRole: AdminRole.SUPER_ADMIN,
};

const READER_PRINCIPAL = {
  sub: 'reader-1',
  accountType: 'reader' as const,
};

/** The guard double: stands in for token verification, and only for token verification. */
const authenticateAs = (principal: Record<string, unknown>) => ({
  canActivate: (context: { switchToHttp: () => { getRequest: () => { user: unknown } } }) => {
    context.switchToHttp().getRequest().user = principal;
    return true;
  },
});

describe('AdminWafController', () => {
  let app: INestApplication<Server>;
  let ipBlocklistService: IpBlocklistServiceMock;

  const buildApp = async (principal: Record<string, unknown>): Promise<INestApplication<Server>> => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminWafController],
      providers: [
        { provide: IpBlocklistService, useValue: ipBlocklistService },
        { provide: WinstonLoggerService, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn(), verbose: vi.fn() } },
        // `RolesGuard` is the REAL guard: the point of this suite is that the enforcement it performs
        // is actually wired to the controller, so it is provided as-is rather than stubbed out.
        // `Reflector` is supplied by Nest's core module and needs no registration here.
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authenticateAs(principal))
      .compile();

    const application = moduleRef.createNestApplication();
    await application.init();
    return application;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    ipBlocklistService = {
      listBlocked: vi.fn<() => Promise<BlockRecord[]>>().mockResolvedValue([]),
      block: vi.fn<(ip: string, options: BlockOptions) => Promise<boolean>>().mockResolvedValue(true),
      unblock: vi.fn<(ip: string) => Promise<boolean>>().mockResolvedValue(true),
    };
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    app = undefined as unknown as INestApplication<Server>;
  });

  /**
   * THE REGRESSION TEST FOR THE BROKEN ACCESS CONTROL.
   *
   * Before the fix the controller carried `@UseGuards(JwtAuthGuard)` only, and `@RequireAdminRole()`
   * is metadata with no reader, so an authenticated non-admin was served normally. Each assertion
   * below is a route that used to answer 200/201 to that caller.
   */
  describe('admin role enforcement', () => {
    it('should refuse a plain authenticated reader on every route', async () => {
      app = await buildApp(READER_PRINCIPAL);

      await request(app.getHttpServer()).get('/admin/waf/blocked-ips').expect(403);
      await request(app.getHttpServer())
        .post('/admin/waf/block-ip')
        .send({ ip: '1.2.3.4', reason: 'test', kind: 'permanent' })
        .expect(403);
      await request(app.getHttpServer()).post('/admin/waf/unblock-ip').send({ ip: '1.2.3.4' }).expect(403);
      await request(app.getHttpServer()).post('/admin/waf/clear-counters').send({ ip: '1.2.3.4' }).expect(403);
      await request(app.getHttpServer()).post('/admin/waf/clear-blocks').send({ ip: '1.2.3.4' }).expect(403);
    });

    it('should not reach the blocklist service when the caller is not a super admin', async () => {
      app = await buildApp(READER_PRINCIPAL);

      await request(app.getHttpServer()).get('/admin/waf/blocked-ips').expect(403);

      expect(ipBlocklistService.listBlocked).not.toHaveBeenCalled();
      expect(ipBlocklistService.block).not.toHaveBeenCalled();
      expect(ipBlocklistService.unblock).not.toHaveBeenCalled();
    });

    it('should refuse an admin account with no admin role at all', async () => {
      app = await buildApp({ sub: 'admin-1', accountType: 'admin' });

      await request(app.getHttpServer()).get('/admin/waf/blocked-ips').expect(403);
    });

    it('should refuse a below-privileged admin role', async () => {
      app = await buildApp({
        sub: 'mod-1',
        accountType: 'admin',
        adminRole: AdminRole.CONTENT_MODERATOR,
      });

      await request(app.getHttpServer()).get('/admin/waf/blocked-ips').expect(403);
    });
  });

  describe('super admin', () => {
    beforeEach(async () => {
      app = await buildApp(SUPER_ADMIN_PRINCIPAL);
    });

    it('should get blocked IPs', async () => {
      const res = await request(app.getHttpServer()).get('/admin/waf/blocked-ips').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should block IP', async () => {
      ipBlocklistService.block.mockResolvedValue(true);
      const res = await request(app.getHttpServer())
        .post('/admin/waf/block-ip')
        .send({ ip: '1.2.3.4', reason: 'test', kind: 'permanent' })
        .expect(201);
      expect((res.body as { success: boolean }).success).toBe(true);
    });

    it('should unblock IP', async () => {
      ipBlocklistService.unblock.mockResolvedValue(true);
      const res = await request(app.getHttpServer())
        .post('/admin/waf/unblock-ip')
        .send({ ip: '1.2.3.4' })
        .expect(200);
      expect((res.body as { success: boolean }).success).toBe(true);
    });
  });
});
