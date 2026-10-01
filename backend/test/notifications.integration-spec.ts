import request from 'supertest';

import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext, TestUser } from '../src/test/helpers/test-context.ts';

describe('Notifications Integration', () => {
  let context: TestContext;
  let user: TestUser;

  beforeAll(async () => {
    context = await createTestContext();
    user = await context.registerAndLogin({ prefix: 'notified' });

    const category = await context.createCategory(user.accessToken, { name: 'Notifications Category' });
    const now = Date.now();
    const contestRes = await request(context.httpServer)
      .post('/contests')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Notifications Contest',
        description: 'Creates a notification for the creator',
        categoryId: category.id,
        startDate: new Date(now + 86400000).toISOString(),
        endDate: new Date(now + 7 * 86400000).toISOString(),
        submissionDeadline: new Date(now + 3 * 86400000).toISOString(),
      })
      .expect(201);

    expect(contestRes.body).toHaveProperty('id');
  });

  afterAll(async () => {
    await context.close();
  });

  const listNotifications = async () => {
    const res = await request(context.httpServer)
      .get('/notifications')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    return res.body.notifications as { id: string; isRead: boolean; type: string }[];
  };

  describe('GET /notifications', () => {
    it('should list the notification produced by the contest creation', async () => {
      const notifications = await listNotifications();

      expect(Array.isArray(notifications)).toBe(true);
      expect(notifications.length).toBeGreaterThanOrEqual(1);
      expect(notifications.some((notification) => notification.type === 'contest.created')).toBe(true);
    });
  });

  describe('GET /notifications/unread-count', () => {
    it('should count unread notifications', async () => {
      const res = await request(context.httpServer)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(typeof res.body.count).toBe('number');
      expect(res.body.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PATCH /notifications/:id/read', () => {
    it('should mark a notification as read', async () => {
      const notifications = await listNotifications();
      const unread = notifications.find((notification) => !notification.isRead);
      expect(unread).toBeDefined();

      const res = await request(context.httpServer)
        .patch(`/notifications/${unread?.id ?? ''}/read`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('message');

      const after = await listNotifications();
      const updated = after.find((notification) => notification.id === unread?.id);
      expect(updated?.isRead).toBe(true);
    });
  });

  describe('PATCH /notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const res = await request(context.httpServer)
        .patch('/notifications/read-all')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('message');

      const count = await request(context.httpServer)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(count.body.count).toBe(0);
    });
  });
});
