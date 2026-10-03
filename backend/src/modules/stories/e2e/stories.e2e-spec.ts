import { eq } from 'drizzle-orm';
import request from 'supertest';

import { db } from '../../../db/index.ts';
import { stories } from '../../../db/schema/stories.schema.ts';

import { StoriesService } from '../stories.service.ts';
import { createTestContext } from '../../../test/helpers/test-context.ts';
import type { StoryResponseBody, TestContext, TestUser } from '../../../test/helpers/test-context.ts';

interface StoryWireResponseBody {
  id: string;
  title: string;
  views: number;
  reactions: number;
  category: string | null;
  tags: string[];
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

describe('Stories E2E (Phase 2 Week 5)', () => {
  let context: TestContext;
  let author: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    context = await createTestContext();
    author = await context.registerAndLogin({ prefix: 'storyauthor', name: 'Story Author' });
    stranger = await context.registerAndLogin({ prefix: 'storystranger', name: 'Story Stranger' });
  });

  afterAll(async () => {
    await context.close();
  });

  const publish = (id: string, token: string) =>
    request(context.httpServer).post(`/stories/${id}/publish`).set('Authorization', `Bearer ${token}`).send({});

  const archive = (id: string, token: string) =>
    request(context.httpServer).post(`/stories/${id}/archive`).set('Authorization', `Bearer ${token}`).send({});

  describe('POST /stories', () => {
    it('should create a draft story owned by the authenticated author', async () => {
      const res = await request(context.httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({
          title: 'The First Draft',
          slug: context.uniqueSlug('first-draft'),
          content: '<p>Once upon a time</p>',
          excerpt: 'A short excerpt',
        })
        .expect(201);

      const body = res.body as StoryResponseBody;
      expect(body.id).toEqual(expect.any(String));
      expect(body.title).toBe('The First Draft');
      expect(body.status).toBe('draft');
      expect(body.authorId).toBe(author.id);
      expect(body.viewCount).toBe(0);
      expect(body.publishedAt).toBeNull();
    });

    it('should reject a duplicate slug with 409', async () => {
      const slug = context.uniqueSlug('duplicate');

      await request(context.httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ title: 'First Owner', slug, content: '<p>a</p>' })
        .expect(201);

      await request(context.httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ title: 'Second Owner', slug, content: '<p>b</p>' })
        .expect(409);
    });

    it('should reject an invalid slug with 400', async () => {
      const res = await request(context.httpServer)
        .post('/stories')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ title: 'Bad Slug', slug: 'Not A Valid Slug', content: '<p>x</p>' })
        .expect(400);

      expect(JSON.stringify(res.body)).toContain('Slug');
    });

    it('should reject an unauthenticated create with 401', async () => {
      await request(context.httpServer)
        .post('/stories')
        .send({ title: 'Anonymous', slug: context.uniqueSlug('anonymous'), content: '<p>x</p>' })
        .expect(401);
    });
  });

  describe('PATCH /stories/:id', () => {
    it('should update a story owned by the author', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Editable Draft' });

      const res = await request(context.httpServer)
        .patch(`/stories/${story.id}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ title: 'Edited Draft' })
        .expect(200);

      const body = res.body as StoryResponseBody;
      expect(body.title).toBe('Edited Draft');

      const reloaded = await request(context.httpServer).get(`/stories/${story.id}`).expect(200);
      expect((reloaded.body as StoryResponseBody).title).toBe('Edited Draft');
    });

    it('should refuse updates from a different user with 403', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Protected Draft' });

      await request(context.httpServer)
        .patch(`/stories/${story.id}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ title: 'Hijacked' })
        .expect(403);
    });
  });

  describe('POST /stories/:id/publish', () => {
    it('should publish an owned draft and stamp publishedAt', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Publishable' });

      const res = await publish(story.id, author.accessToken).expect(201);

      const body = res.body as StoryResponseBody;
      expect(body.status).toBe('published');
      expect(body.publishedAt).not.toBeNull();
    });

    it('should refuse publishing twice with 403', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Publish Once' });
      await publish(story.id, author.accessToken).expect(201);

      await publish(story.id, author.accessToken).expect(403);
    });

    it('should refuse publishing a story owned by someone else with 403', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Not Yours' });

      await publish(story.id, stranger.accessToken).expect(403);
    });

    it('should refuse publishing an archived story with 403', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Archived First' });
      await archive(story.id, author.accessToken).expect(201);

      await publish(story.id, author.accessToken).expect(403);
    });
  });

  describe('POST /stories/:id/archive', () => {
    it('should archive an owned story', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Archivable' });

      const res = await archive(story.id, author.accessToken).expect(201);

      expect((res.body as StoryResponseBody).status).toBe('archived');
    });

    it('should refuse archiving twice with 403', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Archive Once' });
      await archive(story.id, author.accessToken).expect(201);

      await archive(story.id, author.accessToken).expect(403);
    });
  });

  describe('GET /stories', () => {
    it('should list stories and honour the search filter', async () => {
      const marker = context.namespace;
      const story = await context.createStory(author.accessToken, { title: `Zephyr ${marker}` });
      await publish(story.id, author.accessToken).expect(201);

      const res = await request(context.httpServer)
        .get(`/stories?search=${encodeURIComponent(marker)}`)
        .expect(200);

      expect(res.body).toHaveProperty('stories');
      const stories = res.body.stories as StoryResponseBody[];
      expect(stories.some((entry) => entry.title === `Zephyr ${marker}`)).toBe(true);
    });
  });

  describe('GET /stories/slug/:slug', () => {
    it('should resolve a published story by slug', async () => {
      const slug = context.uniqueSlug('by-slug');
      const story = await context.createStory(author.accessToken, { title: 'Findable By Slug', slug });
      await publish(story.id, author.accessToken).expect(201);

      const res = await request(context.httpServer).get(`/stories/slug/${slug}`).expect(200);

      expect((res.body as StoryResponseBody).id).toBe(story.id);
    });

    it('should return 404 for an unknown slug', async () => {
      await request(context.httpServer)
        .get(`/stories/slug/${context.uniqueSlug('missing')}`)
        .expect(404);
    });
  });

  describe('GET /search', () => {
    it('should surface a published story through the search module', async () => {
      const marker = context.namespace;
      const story = await context.createStory(author.accessToken, {
        title: `Quicksilver ${marker}`,
        content: `<p>Body for ${marker}</p>`,
      });
      await publish(story.id, author.accessToken).expect(201);

      const res = await request(context.httpServer)
        .get(`/search?query=${encodeURIComponent(marker)}`)
        .expect(200);

      const results = res.body.results as { id: string; title: string }[];
      expect(results.some((entry) => entry.id === story.id)).toBe(true);
    });

    it('should return 400 when the query is missing', async () => {
      await request(context.httpServer).get('/search').expect(400);
    });
  });

  describe('view count', () => {
    const readPersistedViewCount = async (id: string): Promise<number> => {
      const result = await db.select({ viewCount: stories.viewCount }).from(stories).where(eq(stories.id, id));
      return result[0]?.viewCount ?? -1;
    };

    it('should start at zero for a newly created story', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Zero Views' });

      const res = await request(context.httpServer).get(`/stories/${story.id}`).expect(200);

      expect((res.body as StoryWireResponseBody).views).toBe(0);
      expect(await readPersistedViewCount(story.id)).toBe(0);
    });

    it('should serve the wire contract on a single story read', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Wire Contract' });

      const res = await request(context.httpServer).get(`/stories/${story.id}`).expect(200);
      const body = res.body as StoryWireResponseBody;

      expect(body.id).toBe(story.id);
      expect(body.author).toEqual({ id: author.id, name: 'Story Author' });
      expect(body.tags).toEqual([]);
      expect(body.createdAt).toEqual(expect.any(String));
      expect(body).not.toHaveProperty('viewCount');
      expect(body).not.toHaveProperty('categoryId');
      expect(body).not.toHaveProperty('authorId');
    });

    it('should increment the persisted viewCount through the stories service', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Counted Views' });
      const storiesService = context.app.get(StoriesService);

      await storiesService.incrementViewCount(story.id);
      await storiesService.incrementViewCount(story.id);

      expect(await readPersistedViewCount(story.id)).toBe(2);
    });

    it('should surface the incremented viewCount on the next API read', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Fresh Reads' });
      const storiesService = context.app.get(StoriesService);

      const before = await request(context.httpServer).get(`/stories/${story.id}`).expect(200);
      expect((before.body as StoryWireResponseBody).views).toBe(0);

      await storiesService.incrementViewCount(story.id);

      const after = await request(context.httpServer).get(`/stories/${story.id}`).expect(200);
      expect((after.body as StoryWireResponseBody).views).toBe(1);
    });
  });

  describe('DELETE /stories/:id', () => {
    it('should soft delete an owned story and hide it from reads', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Doomed Story' });

      await request(context.httpServer)
        .delete(`/stories/${story.id}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(204);

      await request(context.httpServer).get(`/stories/${story.id}`).expect(404);

      const list = await request(context.httpServer).get('/stories').expect(200);
      const stories = list.body.stories as StoryResponseBody[];
      expect(stories.some((entry) => entry.id === story.id)).toBe(false);
    });

    it('should refuse deleting a story owned by someone else with 403', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Survivor' });

      await request(context.httpServer)
        .delete(`/stories/${story.id}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(403);
    });
  });
});
