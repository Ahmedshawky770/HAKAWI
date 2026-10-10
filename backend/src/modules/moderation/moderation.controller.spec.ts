import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { RestrictionGuard } from '../../common/guards/restriction.guard.ts';
import { RolesGuard } from '../../common/guards/roles.guard.ts';
import { PermissionsGuard } from '../../common/guards/permissions.guard.ts';
import { AdminRole, AccountType } from '../../common/constants/roles.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';

import { ModerationController } from './moderation.controller.ts';
import { ModerationService } from './moderation.service.ts';
import { AdminDashboardService } from './admin-dashboard.service.ts';

type MockModerationService = {
  createReport: ReturnType<typeof vi.fn>;
  findAllReports: ReturnType<typeof vi.fn>;
  updateReportStatus: ReturnType<typeof vi.fn>;
  takeAction: ReturnType<typeof vi.fn>;
  checkAutoEscalation: ReturnType<typeof vi.fn>;
  autoEscalateReports: ReturnType<typeof vi.fn>;
};

type MockAdminDashboardService = {
  getStats: ReturnType<typeof vi.fn>;
  getReportTrends: ReturnType<typeof vi.fn>;
  getUserRestrictions: ReturnType<typeof vi.fn>;
  getModerationActions: ReturnType<typeof vi.fn>;
  autoEscalateReports: ReturnType<typeof vi.fn>;
};

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

const TARGET_ID = '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8';
const TARGET_USER_ID = '9b1d4f7a-1c2e-4f5b-8a9d-0e1f2a3b4c5d';

type TokenParams = {
  sub?: string;
  email?: string;
  accountType?: AccountType;
  adminRole?: AdminRole;
};

async function generateToken({
  sub = 'user-1',
  email = 'test@example.com',
  accountType = AccountType.READER,
  adminRole,
}: TokenParams = {}): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({
    sub,
    email,
    accountType,
    ...(adminRole ? { adminRole } : {}),
  });
}

function moderatorToken(): Promise<string> {
  return generateToken({ accountType: AccountType.ADMIN, adminRole: AdminRole.CONTENT_MODERATOR });
}

function superAdminToken(): Promise<string> {
  return generateToken({ accountType: AccountType.ADMIN, adminRole: AdminRole.SUPER_ADMIN });
}

describe('ModerationController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let moderationService: MockModerationService;
  let adminDashboardService: MockAdminDashboardService;

  beforeAll(async () => {
    moderationService = {
      createReport: vi.fn(),
      findAllReports: vi.fn(),
      updateReportStatus: vi.fn(),
      takeAction: vi.fn(),
      checkAutoEscalation: vi.fn(),
      autoEscalateReports: vi.fn(),
    };

    adminDashboardService = {
      getStats: vi.fn(),
      getReportTrends: vi.fn(),
      getUserRestrictions: vi.fn(),
      getModerationActions: vi.fn(),
      autoEscalateReports: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [ModerationController],
      providers: [
        {
          provide: ModerationService,
          useValue: moderationService,
        },
        {
          provide: AdminDashboardService,
          useValue: adminDashboardService,
        },
        JwtAuthGuard,
        RolesGuard,
        PermissionsGuard,
        RestrictionGuard,
        {
          provide: Reflector,
          useValue: new Reflector(),
        },
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET }),
        },
        // `SECURED_GUARDS` composes `RestrictionGuard`, which injects `ValkeyService` and the logger.
        // This module is hand-built rather than importing `CommonModule`, so both must be provided —
        // the alternative is the whole suite failing at DI resolution before a single assertion runs.
        { provide: ValkeyService, useValue: { exists: vi.fn().mockResolvedValue(false), get: vi.fn(), set: vi.fn() } },
        {
          provide: WinstonLoggerService,
          useValue: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn(), verbose: vi.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /moderation/reports', () => {
    it('should create a new report', async () => {
      const token = await generateToken({ accountType: AccountType.READER });

      vi.mocked(moderationService.createReport).mockResolvedValue({
        id: 'report-1',
        reporterId: 'user-1',
        targetId: 'target-1',
        targetType: 'story',
        reason: 'spam',
        description: 'This is spam',
        status: 'open',
        escalatedAt: null,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(httpServer)
        .post('/moderation/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetId: TARGET_ID, targetType: 'story', reason: 'spam', description: 'This is spam' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'report-1');
      expect(res.body).toHaveProperty('status', 'open');
      expect(moderationService.createReport).toHaveBeenCalledWith('user-1', {
        targetId: TARGET_ID,
        targetType: 'story',
        reason: 'spam',
        description: 'This is spam',
      });
    });
  });

  describe('GET /moderation/reports', () => {
    it('should return paginated reports', async () => {
      const token = await moderatorToken();

      vi.mocked(moderationService.findAllReports).mockResolvedValue({
        reports: [],
        total: 0,
      });

      const res = await request(httpServer)
        .get('/moderation/reports')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('reports');
      expect(res.body).toHaveProperty('total', 0);
      expect(moderationService.findAllReports).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });
  });

  describe('PATCH /moderation/reports/:id', () => {
    it('should update a report status', async () => {
      const token = await moderatorToken();

      vi.mocked(moderationService.updateReportStatus).mockResolvedValue({
        id: 'report-1',
        reporterId: 'user-1',
        targetId: 'target-1',
        targetType: 'story',
        reason: 'spam',
        description: 'This is spam',
        status: 'resolved',
        escalatedAt: null,
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(httpServer)
        .patch('/moderation/reports/report-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'resolved' })
        .expect(200);

      expect(res.body).toHaveProperty('status', 'resolved');
      expect(moderationService.updateReportStatus).toHaveBeenCalledWith('report-1', { status: 'resolved' });
    });
  });

  describe('POST /moderation/reports/:id/actions', () => {
    it('should take a moderation action on a report', async () => {
      const token = await moderatorToken();

      vi.mocked(moderationService.takeAction).mockResolvedValue({
        id: 'action-1',
        reportId: 'report-1',
        adminId: 'admin-1',
        action: 'warn',
        reason: 'First warning',
        durationMinutes: null,
        targetUserId: TARGET_USER_ID,
        createdAt: new Date(),
      });

      const res = await request(httpServer)
        .post('/moderation/reports/report-1/actions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'warn', reason: 'First warning', targetUserId: TARGET_USER_ID })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'action-1');
      expect(res.body).toHaveProperty('action', 'warn');
      expect(moderationService.takeAction).toHaveBeenCalledWith('report-1', 'user-1', {
        action: 'warn',
        reason: 'First warning',
        targetUserId: TARGET_USER_ID,
      });
    });
  });

  describe('GET /moderation/stats', () => {
    it('should return admin stats', async () => {
      const token = await superAdminToken();

      vi.mocked(adminDashboardService.getStats).mockResolvedValue({
        totalReports: 0,
        openReports: 0,
        escalatedReports: 0,
        inReviewReports: 0,
        resolvedReports: 0,
        dismissedReports: 0,
        totalActions: 0,
        totalRestrictions: 0,
        activeRestrictions: 0,
        avgResolutionMinutes: 0,
      });

      const res = await request(httpServer)
        .get('/moderation/stats')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalReports');
      expect(res.body).toHaveProperty('openReports');
    });
  });

  describe('GET /moderation/users/:id/restrictions', () => {
    it('should return user restrictions', async () => {
      const token = await generateToken({ accountType: AccountType.READER });

      vi.mocked(adminDashboardService.getUserRestrictions).mockResolvedValue({
        restrictions: [],
      });

      const res = await request(httpServer)
        .get('/moderation/users/user-1/restrictions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('restrictions');
    });
  });

  describe('GET /moderation/reports/trends', () => {
    it('should return report trends', async () => {
      const token = await superAdminToken();

      vi.mocked(adminDashboardService.getReportTrends).mockResolvedValue({});

      const res = await request(httpServer)
        .get('/moderation/reports/trends')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(typeof res.body).toBe('object');
    });
  });

  describe('authorization', () => {
    const forbiddenRoutes: ReadonlyArray<{ method: 'get' | 'patch' | 'post'; path: string; body?: object }> = [
      { method: 'get', path: '/moderation/reports' },
      { method: 'patch', path: '/moderation/reports/report-1', body: { status: 'resolved' } },
      {
        method: 'post',
        path: '/moderation/reports/report-1/actions',
        body: { action: 'warn', reason: 'r', targetUserId: TARGET_USER_ID },
      },
      { method: 'get', path: '/moderation/stats' },
      { method: 'get', path: '/moderation/reports/trends' },
      { method: 'get', path: '/moderation/actions' },
    ];

    it.each(forbiddenRoutes)('should reject a reader on $method $path', async ({ method, path, body }) => {
      const token = await generateToken({ accountType: AccountType.READER });

      const req = request(httpServer)[method](path).set('Authorization', `Bearer ${token}`);
      if (body) {
        req.send(body);
      }

      await req.expect(403);
    });

    it.each(forbiddenRoutes)(
      'should reject a request without any token on $method $path',
      async ({ method, path, body }) => {
        const req = request(httpServer)[method](path);
        if (body) {
          req.send(body);
        }

        await req.expect(401);
      },
    );

    it('should reject a moderator on a super_admin route', async () => {
      const token = await moderatorToken();

      await request(httpServer).get('/moderation/stats').set('Authorization', `Bearer ${token}`).expect(403);

      expect(adminDashboardService.getStats).not.toHaveBeenCalled();
    });

    it('should allow a super_admin on a moderator route', async () => {
      const token = await superAdminToken();

      vi.mocked(moderationService.findAllReports).mockResolvedValue({ reports: [], total: 0 });

      await request(httpServer).get('/moderation/reports').set('Authorization', `Bearer ${token}`).expect(200);

      expect(moderationService.findAllReports).toHaveBeenCalled();
    });

    it('should not leak another user restrictions to a reader', async () => {
      const token = await generateToken({ sub: 'reader-1', accountType: AccountType.READER });

      const res = await request(httpServer)
        .get('/moderation/users/other-user/restrictions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ restrictions: [] });
      expect(adminDashboardService.getUserRestrictions).not.toHaveBeenCalled();
    });
  });
});
