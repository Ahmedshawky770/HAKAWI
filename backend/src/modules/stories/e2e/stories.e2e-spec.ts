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

  /**
   * Reads a story as its author, which is the only population allowed to read an unpublished one.
   *
   * WHY THE AUTHOR TOKEN APPEARS THROUGHOUT THIS FILE NOW. `GET /stories/:id` is `@Public()` and
   * `StoriesService.findById` decides visibility from `status`, so an anonymous read of a draft is
   * answered with 404 — by design, because that anonymous read is exactly the leak. Nearly every
   * story below is created as a draft and never published, so asserting the wire contract on one
   * means reading it the way the shipped edit page does: with the author's credential. The cases
   * that genuinely test the public surface stay anonymous, and the drafts' 404 is pinned in
   * `test/stories.integration-spec.ts`.
   */
  const readOwnStory = (id: string) =>
    request(context.httpServer).get(`/stories/${id}`).set('Authorization', `Bearer ${author.accessToken}`);

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

      const reloaded = await readOwnStory(story.id).expect(200);
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

    /**
     * The leak, end to end. `GET /stories` is `@Public()` and the route used to forward the caller's
     * `status` into `WHERE status = $1`, so this exact request returned another author's unpublished
     * draft — title, excerpt and slug — to a caller with no account at all.
     */
    it('should never return an unpublished story to an anonymous caller, whatever status it asks for', async () => {
      const draft = await context.createStory(author.accessToken, { title: `Undisclosed ${context.namespace}` });

      for (const query of ['', '?status=draft', '?status=archived']) {
        const res = await request(context.httpServer).get(`/stories${query}`).expect(200);

        const listed = res.body.stories as StoryResponseBody[];
        expect(listed.some((entry) => entry.id === draft.id)).toBe(false);
      }
    });

    it('should reject a status outside the lifecycle rather than silently ignoring the typo', async () => {
      await request(context.httpServer).get('/stories?status=publshed').expect(400);
    });
  });

  /**
   * `GET /stories/mine` — the route that makes a draft findable again.
   *
   * `GET /stories` is pinned to `published`, and it is not `@Public()` by accident: with `?status` or an
   * `authorId` on that DTO it used to be an anonymous dump of every draft in the system. This route is
   * the other half of the answer, and the properties asserted here are the ones that make it the
   * opposite of that leak: the author is the verified subject, another author's draft is invisible, and
   * an anonymous caller gets nothing at all.
   */
  describe('GET /stories/mine', () => {
    it("should list the caller's own unpublished stories, which the public list cannot show", async () => {
      const draft = await context.createStory(author.accessToken, {
        title: `Mine Draft ${context.namespace}`,
      });

      const res = await request(context.httpServer)
        .get('/stories/mine')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const listed = res.body.stories as StoryResponseBody[];
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(listed.some((entry) => entry.id === draft.id)).toBe(true);
      // Every row on this route is invisible to `GET /stories`; a published one appearing here would
      // mean the status filter stopped being a filter.
      expect(listed.every((entry) => entry.status !== 'published')).toBe(true);
    });

    it("should not disclose another author's draft, whatever the caller sends", async () => {
      const otherDraft = await context.createStory(stranger.accessToken, {
        title: `Not Mine ${context.namespace}`,
      });

      const res = await request(context.httpServer)
        .get('/stories/mine')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const listed = res.body.stories as StoryResponseBody[];
      expect(listed.some((entry) => entry.id === otherDraft.id)).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain(`Not Mine ${context.namespace}`);
    });

    it('should refuse a caller-supplied authorId rather than list that account', async () => {
      // The trap this route shape exists to avoid: an `authorId` field on the PUBLIC list's DTO. Here
      // the DTO declares no such property, so the production pipe answers 400 and the service is
      // never asked for anybody's rows.
      await request(context.httpServer)
        .get(`/stories/mine?authorId=${stranger.id}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(400);
    });

    it('should refuse an anonymous caller', async () => {
      await request(context.httpServer).get('/stories/mine').expect(401);
    });

    it('should include an archived story, which is unpublished and not deleted', async () => {
      const archived = await context.createStory(author.accessToken, { title: 'Mine Archived' });
      await archive(archived.id, author.accessToken).expect(201);

      const res = await request(context.httpServer)
        .get('/stories/mine')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const listed = res.body.stories as StoryResponseBody[];
      expect(listed.some((entry) => entry.id === archived.id)).toBe(true);
    });

    it('should narrow to one status and refuse to list published work here', async () => {
      const archived = await context.createStory(author.accessToken, { title: 'Mine Narrowed' });
      await archive(archived.id, author.accessToken).expect(201);

      const narrowed = await request(context.httpServer)
        .get('/stories/mine?status=archived')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const listed = narrowed.body.stories as StoryResponseBody[];
      expect(listed.every((entry) => entry.status === 'archived')).toBe(true);
      expect(listed.some((entry) => entry.id === archived.id)).toBe(true);

      // `published` is not a narrower answer, it is a different question — and `GET /stories` answers
      // it, which is why this one refuses instead of quietly filtering or quietly ignoring.
      await request(context.httpServer)
        .get('/stories/mine?status=published')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(400);
    });

    it('should not let the :id route capture the literal `mine` segment', async () => {
      // `@Get(':id')` above `@Get('mine')` would bind `id="mine"`, and Postgres would raise 22P02 on
      // the uuid cast — surfacing as a 404 that reads exactly like "you have no drafts".
      const res = await request(context.httpServer)
        .get('/stories/mine')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('stories');
      expect(res.body).toHaveProperty('total');
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

  /**
   * The unpublished rule on the detail routes, at the layer where the cache and the database are
   * real. `test/stories.integration-spec.ts` carries the full three-way assertion; this is the short
   * version that keeps the "read it as its author" helper above honest — if the rule were removed,
   * every `readOwnStory` call in this file would still pass while the route went back to serving
   * drafts to anyone, and only these cases would notice.
   */
  describe('unpublished stories are not public', () => {
    it('should answer 404 to an anonymous reader and 200 to the author, by id', async () => {
      const draft = await context.createStory(author.accessToken, { title: 'Private Draft By Id' });

      await request(context.httpServer).get(`/stories/${draft.id}`).expect(404);
      await readOwnStory(draft.id).expect(200);
    });

    it('should answer 404 to an authenticated stranger, by id', async () => {
      const draft = await context.createStory(author.accessToken, { title: 'Private Draft Stranger' });

      await request(context.httpServer)
        .get(`/stories/${draft.id}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);
    });

    it('should answer 404 to an anonymous reader by slug', async () => {
      const slug = context.uniqueSlug('private-slug');
      const draft = await context.createStory(author.accessToken, { title: 'Private Draft By Slug', slug });

      await request(context.httpServer).get(`/stories/slug/${slug}`).expect(404);
      await readOwnStory(draft.id).expect(200);
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

      const res = await readOwnStory(story.id).expect(200);

      expect((res.body as StoryWireResponseBody).views).toBe(0);
      expect(await readPersistedViewCount(story.id)).toBe(0);
    });

    it('should serve the wire contract on a single story read', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Wire Contract' });

      const res = await readOwnStory(story.id).expect(200);
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

      await storiesService.incrementViewCount(story.id, { sub: author.id });
      await storiesService.incrementViewCount(story.id, { sub: author.id });

      expect(await readPersistedViewCount(story.id)).toBe(2);
    });

    it('should surface the incremented viewCount on the next API read', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Fresh Reads' });
      const storiesService = context.app.get(StoriesService);

      const before = await readOwnStory(story.id).expect(200);
      expect((before.body as StoryWireResponseBody).views).toBe(0);

      await storiesService.incrementViewCount(story.id, { sub: author.id });

      const after = await readOwnStory(story.id).expect(200);
      expect((after.body as StoryWireResponseBody).views).toBe(1);
    });

    /**
     * `POST /stories/:id/view` is the only HTTP writer of the column. The two cases above reach into
     * `StoriesService` directly, which is exactly why the counter was permanently 0 in production
     * while the deliverable was documented as shipped: nothing a real client could call ever ran.
     *
     * The story is PUBLISHED first, and that is the point: an ordinary authenticated reader counting a
     * view on published content is the normal case and must keep working. The refusal for unpublished
     * work is the next case, not this one.
     */
    it('should increment the persisted viewCount over HTTP for an authenticated reader', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Counted Over HTTP' });
      await publish(story.id, author.accessToken).expect(201);

      const res = await request(context.httpServer)
        .post(`/stories/${story.id}/view`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(204);

      expect(res.body).toEqual({});
      expect(await readPersistedViewCount(story.id)).toBe(1);

      const read = await request(context.httpServer)
        .get(`/stories/${story.id}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);
      expect((read.body as StoryWireResponseBody).views).toBe(1);
    });

    /**
     * The oracle this route was, at the layer where the database is real. It took no viewer, so a 204
     * confirmed that a given unpublished id exists to any account that cared to ask. It now runs the
     * same rule the detail route runs, and the two answers are compared byte-for-byte below: a caller
     * cannot probe a draft through this write route more cheaply than through `GET /stories/:id`.
     */
    it('should refuse a view count on an unpublished story, with the same answer the detail route gives', async () => {
      const draft = await context.createStory(author.accessToken, { title: 'Draft View Probe' });

      const view = await request(context.httpServer)
        .post(`/stories/${draft.id}/view`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      const detail = await request(context.httpServer)
        .get(`/stories/${draft.id}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      expect(view.body.message).toBe('Story not found');
      expect(view.body).toEqual(detail.body);
      expect(await readPersistedViewCount(draft.id)).toBe(0);
    });

    it('should still let the author count a view on their own draft, which they may read', async () => {
      const draft = await context.createStory(author.accessToken, { title: 'Author Views Own Draft' });

      await request(context.httpServer)
        .post(`/stories/${draft.id}/view`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(204);

      expect(await readPersistedViewCount(draft.id)).toBe(1);
    });

    it('should refuse an anonymous view count with 401', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Anonymous Views' });

      await request(context.httpServer).post(`/stories/${story.id}/view`).expect(401);

      expect(await readPersistedViewCount(story.id)).toBe(0);
    });

    it('should not count a view for a soft-deleted story', async () => {
      const story = await context.createStory(author.accessToken, { title: 'Deleted Then Viewed' });
      await request(context.httpServer)
        .delete(`/stories/${story.id}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(204);

      await request(context.httpServer)
        .post(`/stories/${story.id}/view`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      expect(await readPersistedViewCount(story.id)).toBe(0);
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
