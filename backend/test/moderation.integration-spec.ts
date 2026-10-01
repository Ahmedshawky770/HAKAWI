import request from 'supertest';

import { AdminRole } from '../src/common/constants/roles.ts';
import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext } from '../src/test/helpers/test-context.ts';

describe('Moderation Integration', () => {
  let context: TestContext;
  let superAdminToken: string;
  let readerToken: string;
  let readerUserId: string;
  let reportId: string;

  beforeAll(async () => {
    context = await createTestContext();

    const superAdmin = await context.registerAndLogin({ prefix: 'superadmin', name: 'Super Admin' });
    await context.promoteToAdmin(superAdmin.id);
    superAdminToken = (await context.login(superAdmin.email)).accessToken;

    const reader = await context.registerAndLogin({ prefix: 'reader', name: 'Plain Reader' });
    readerUserId = reader.id;
    readerToken = reader.accessToken;
  });

  afterAll(async () => {
    await context.close();
  });

  describe('POST /moderation/reports', () => {
    it('should create a new report', async () => {
      const res = await request(context.httpServer)
        .post('/moderation/reports')
        .set('Authorization', `Bearer ${readerToken}`)
        .send({ targetId: readerUserId, targetType: 'user', reason: 'spam' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      reportId = res.body.id;
    });
  });

  describe('GET /moderation/stats', () => {
    it('should return admin stats for super admin', async () => {
      const res = await request(context.httpServer)
        .get('/moderation/stats')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('totalReports');
      expect(res.body).toHaveProperty('openReports');
      expect(res.body).toHaveProperty('totalActions');
      expect(res.body.totalReports).toBeGreaterThanOrEqual(1);
    });

    it('should return 403 for a reader', async () => {
      await request(context.httpServer)
        .get('/moderation/stats')
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(403);
    });

    it('should reject a token minted before the promotion and accept a freshly minted one', async () => {
      const promoted = await context.registerAndLogin({ prefix: 'stale', name: 'Stale Admin Token' });
      await context.promoteToAdmin(promoted.id);

      await request(context.httpServer)
        .get('/moderation/stats')
        .set('Authorization', `Bearer ${promoted.accessToken}`)
        .expect(403);

      const freshToken = await context.login(promoted.email);
      await request(context.httpServer)
        .get('/moderation/stats')
        .set('Authorization', `Bearer ${freshToken.accessToken}`)
        .expect(200);
    });
  });

  describe('GET /moderation/users/:id/restrictions', () => {
    it('should return own restrictions', async () => {
      const res = await request(context.httpServer)
        .get(`/moderation/users/${readerUserId}/restrictions`)
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('restrictions');
      expect(Array.isArray(res.body.restrictions)).toBe(true);
    });

    it('should return restrictions for another user', async () => {
      const res = await request(context.httpServer)
        .get(`/moderation/users/${readerUserId}/restrictions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('restrictions');
      expect(Array.isArray(res.body.restrictions)).toBe(true);
    });
  });

  describe('GET /moderation/reports/trends', () => {
    it('should return report trends for super admin', async () => {
      const res = await request(context.httpServer)
        .get('/moderation/reports/trends?days=7')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);

      expect(typeof res.body).toBe('object');
    });

    it('should return 403 for a reader', async () => {
      await request(context.httpServer)
        .get('/moderation/reports/trends?days=7')
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(403);
    });
  });

  describe('GET /moderation/reports', () => {
    it('should list reports for a content moderator', async () => {
      const moderator = await context.registerAndLogin({ prefix: 'moderator', name: 'Content Moderator' });
      await context.promoteToAdmin(moderator.id, AdminRole.CONTENT_MODERATOR);
      const moderatorToken = (await context.login(moderator.email)).accessToken;

      const res = await request(context.httpServer)
        .get('/moderation/reports')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('reports');
    });

    it('should return 403 for a reader', async () => {
      await request(context.httpServer)
        .get('/moderation/reports')
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(403);
    });
  });
});
