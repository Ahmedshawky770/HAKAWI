import request from 'supertest';

import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext, TestUser } from '../src/test/helpers/test-context.ts';

describe('Search Integration', () => {
  let context: TestContext;
  let author: TestUser;

  beforeAll(async () => {
    context = await createTestContext();
    author = await context.registerAndLogin({ prefix: 'searcher' });

    const story = await context.createStory(author.accessToken, {
      title: `Searchable ${context.namespace} Chronicle`,
      content: `<p>Distinctive body copy for ${context.namespace}</p>`,
    });
    await request(context.httpServer)
      .post(`/stories/${story.id}/publish`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    await context.close();
  });

  describe('GET /search', () => {
    it('should return 400 when no query parameter is provided', async () => {
      await request(context.httpServer).get('/search').expect(400);
    });

    it('should find the published story by a unique query', async () => {
      const res = await request(context.httpServer)
        .get(`/search?query=${encodeURIComponent(context.namespace)}`)
        .expect(200);

      expect(res.body).toHaveProperty('results');
      expect(res.body).toHaveProperty('total');
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(res.body.results.some((result: { title: string }) => result.title.includes(context.namespace))).toBe(true);
    });

    it('should return an empty result set for an unknown query', async () => {
      const res = await request(context.httpServer)
        .get(`/search?query=${encodeURIComponent(`no-such-term-${context.namespace}`)}`)
        .expect(200);

      expect(res.body.total).toBe(0);
      expect(res.body.results).toEqual([]);
    });

    it('should coerce the pagination query because SearchFiltersDto is a validated class', async () => {
      const res = await request(context.httpServer)
        .get(`/search?query=${encodeURIComponent(context.namespace)}&status=published&page=1&limit=10`)
        .expect(200);

      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
    });
  });

  describe('GET /search/authors', () => {
    it('should return 400 when the q parameter is missing', async () => {
      await request(context.httpServer).get('/search/authors').expect(400);
    });

    it('should search authors by name', async () => {
      const res = await request(context.httpServer)
        .get(`/search/authors?q=${encodeURIComponent('searcher')}`)
        .expect(200);

      expect(res.body).toHaveProperty('authors');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.authors)).toBe(true);
    });
  });

  describe('GET /search/categories', () => {
    it('should return 400 when the q parameter is missing', async () => {
      await request(context.httpServer).get('/search/categories').expect(400);
    });

    it('should search categories by name', async () => {
      const res = await request(context.httpServer)
        .get(`/search/categories?q=${encodeURIComponent('tech')}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
