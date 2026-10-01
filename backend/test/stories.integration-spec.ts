import request from 'supertest';

import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext, TestUser } from '../src/test/helpers/test-context.ts';

describe('Stories Integration', () => {
  let context: TestContext;
  let author: TestUser;
  let storyId: string;
  let originalTitle: string;

  beforeAll(async () => {
    context = await createTestContext();
    author = await context.registerAndLogin({ prefix: 'storyauthor' });

    const story = await context.createStory(author.accessToken, { title: 'Test Story' });
    storyId = story.id;
    originalTitle = story.title;
  });

  afterAll(async () => {
    await context.close();
  });

  describe('POST /stories', () => {
    it('should create a new story as a draft owned by the caller', async () => {
      expect(storyId).toEqual(expect.any(String));
      expect(originalTitle).toBe('Test Story');

      const res = await request(context.httpServer).get(`/stories/${storyId}`).expect(200);

      expect(res.body.status).toBe('draft');
      expect(res.body.author.id).toBe(author.id);
      expect(res.body.views).toBe(0);
    });

    it('should return 401 when creating a story without a token', async () => {
      await request(context.httpServer)
        .post('/stories')
        .send({ title: 'Anonymous Story', slug: context.uniqueSlug('anonymous'), content: 'x' })
        .expect(401);
    });
  });

  describe('GET /stories', () => {
    it('should get a paginated list of stories', async () => {
      const res = await request(context.httpServer).get('/stories?page=1&limit=20').expect(200);

      expect(res.body).toHaveProperty('stories');
      expect(Array.isArray(res.body.stories)).toBe(true);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /stories/:id', () => {
    it('should get a story by id', async () => {
      const res = await request(context.httpServer).get(`/stories/${storyId}`).expect(200);

      expect(res.body.id).toBe(storyId);
      expect(res.body.title).toBe(originalTitle);
    });

    it('should return 404 when story not found', async () => {
      await request(context.httpServer).get('/stories/00000000-0000-0000-0000-000000000000').expect(404);
    });
  });

  describe('PATCH /stories/:id', () => {
    it('should update a story owned by the caller', async () => {
      const res = await request(context.httpServer)
        .patch(`/stories/${storyId}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ title: 'Updated Title' })
        .expect(200);

      expect(res.body.title).toBe('Updated Title');
    });

    it('should refuse updates from a different user', async () => {
      const stranger = await context.registerAndLogin({ prefix: 'stranger' });

      await request(context.httpServer)
        .patch(`/stories/${storyId}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ title: 'Hijacked Title' })
        .expect(403);
    });
  });

  describe('DELETE /stories/:id', () => {
    it('should soft delete a story', async () => {
      const disposable = await context.createStory(author.accessToken, { title: 'Disposable Story' });

      const res = await request(context.httpServer)
        .delete(`/stories/${disposable.id}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(204);

      expect(res.status).toBe(204);
      await request(context.httpServer).get(`/stories/${disposable.id}`).expect(404);
    });
  });
});
