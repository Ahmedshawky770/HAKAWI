import request from 'supertest';

import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext, TestUser } from '../src/test/helpers/test-context.ts';

describe('Users Integration', () => {
  let context: TestContext;
  let user: TestUser;

  beforeAll(async () => {
    context = await createTestContext();
    user = await context.registerAndLogin({ prefix: 'users', name: 'Users Integration User' });
  });

  afterAll(async () => {
    await context.close();
  });

  describe('GET /users/me', () => {
    it('should get current user profile', async () => {
      const res = await request(context.httpServer)
        .get('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(user.id);
      expect(res.body.email).toBe(user.email);
      expect(res.body.username).toBe(user.username);
    });

    it('should return 401 without a token', async () => {
      await request(context.httpServer).get('/users/me').expect(401);
    });
  });

  describe('PATCH /users/me', () => {
    it('should update current user profile', async () => {
      const res = await request(context.httpServer)
        .patch('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.name).toBe('Updated Name');

      const me = await request(context.httpServer)
        .get('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(me.body.name).toBe('Updated Name');
    });
  });

  describe('GET /users/:id', () => {
    it('should expose only the public profile of a user', async () => {
      const res = await request(context.httpServer).get(`/users/${user.id}`).expect(200);

      expect(res.body.id).toBe(user.id);
      expect(res.body.username).toBe(user.username);
      expect(res.body).not.toHaveProperty('email');
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password_hash');
    });

    it('should return 404 when user not found', async () => {
      await request(context.httpServer).get('/users/00000000-0000-0000-0000-000000000000').expect(404);
    });
  });
});
