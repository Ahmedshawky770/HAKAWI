import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';

import { ModerationController } from './moderation.controller.ts';
import { ModerationService } from './moderation.service.ts';
import { AdminDashboardService } from './admin-dashboard.service.ts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.ts';
import { ConfigModule } from '@nestjs/config';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET } as any).signAsync({ sub, email, accountType } as any);
}

describe('ModerationController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let moderationService: Partial<ModerationService>;
  let adminDashboardService: Partial<AdminDashboardService>;

  beforeAll(async () => {
    moderationService = {
      createReport: vi.fn(),
      findAllReports: vi.fn(),
      updateReportStatus: vi.fn(),
      takeAction: vi.fn(),
    };

    adminDashboardService = {
      getStats: vi.fn(),
      getReportTrends: vi.fn(),
      getUserRestrictions: vi.fn(),
      getModerationActions: vi.fn(),
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
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET } as any),
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
      const token = await generateToken('user-1', 'test@example.com', 'reader');

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
      } as any);

      const res = await request(httpServer)
        .post('/moderation/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetId: 'target-1', targetType: 'story', reason: 'spam', description: 'This is spam' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'report-1');
      expect(res.body).toHaveProperty('status', 'open');
      expect(moderationService.createReport).toHaveBeenCalledWith('user-1', {
        targetId: 'target-1',
        targetType: 'story',
        reason: 'spam',
        description: 'This is spam',
      });
    });
  });

  describe('GET /moderation/reports', () => {
    it('should return paginated reports', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(moderationService.findAllReports).mockResolvedValue({
        reports: [],
        total: 0,
      } as any);

      const res = await request(httpServer)
        .get('/moderation/reports')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('reports');
      expect(res.body).toHaveProperty('total', 0);
      expect(moderationService.findAllReports).toHaveBeenCalledWith({});
    });
  });

  describe('PATCH /moderation/reports/:id', () => {
    it('should update a report status', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

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
      } as any);

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
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(moderationService.takeAction).mockResolvedValue({
        id: 'action-1',
        reportId: 'report-1',
        adminId: 'admin-1',
        action: 'warn',
        reason: 'First warning',
        durationMinutes: null,
        targetUserId: 'user-2',
        createdAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .post('/moderation/reports/report-1/actions')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'warn', reason: 'First warning', targetUserId: 'user-2' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'action-1');
      expect(res.body).toHaveProperty('action', 'warn');
      expect(moderationService.takeAction).toHaveBeenCalledWith('report-1', 'user-1', {
        action: 'warn',
        reason: 'First warning',
        targetUserId: 'user-2',
      });
    });
  });

  describe('GET /moderation/stats', () => {
    it('should return admin stats', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin', 'super_admin');

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
      } as any);

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
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(adminDashboardService.getUserRestrictions).mockResolvedValue({
        restrictions: [],
      } as any);

      const res = await request(httpServer)
        .get('/moderation/users/user-1/restrictions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('restrictions');
    });
  });

  describe('GET /moderation/reports/trends', () => {
    it('should return report trends', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'admin', 'super_admin');

      vi.mocked(adminDashboardService.getReportTrends).mockResolvedValue({});

      const res = await request(httpServer)
        .get('/moderation/reports/trends')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(typeof res.body).toBe('object');
    });
  });
});
