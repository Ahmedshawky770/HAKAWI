import request from 'supertest';

import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext, TestUser } from '../src/test/helpers/test-context.ts';
import { AdminRole } from '../src/common/constants/roles.ts';
import type {
  StoryListItemResponse,
  StoryDetail,
  MyStoriesListResponse,
} from '../src/test/helpers/test-response-types.ts';

describe('Stories Integration', () => {
  let context: TestContext;
  let author: TestUser;
  let storyId: string;
  let storySlug: string;
  let originalTitle: string;
  let publishedStoryId: string;

  beforeAll(async () => {
    context = await createTestContext();
    author = await context.registerAndLogin({ prefix: 'storyauthor' });

    const story = await context.createStory(author.accessToken, { title: 'Test Story' });
    storyId = story.id;
    storySlug = story.slug;
    originalTitle = story.title;

    /**
     * WHY A SECOND, PUBLISHED STORY EXISTS.
     *
     * `StoriesController.findAll` pins `status` to `PUBLIC_STORY_STATUS` and never forwards the
     * query string's value, because the route is `@Public()` and `status` went straight into a
     * `WHERE status = $1`. So a list that only ever contains drafts has nothing to return, and
     * asserting `total >= 1` on it asserted the leak rather than the pagination. This story is
     * published through the author's own `POST /stories/:id/publish` — the same route the product
     * uses — so the list below is exercising the real public surface instead of the hole.
     */
    const published = await context.createStory(author.accessToken, { title: 'Test Published Story' });
    publishedStoryId = published.id;

    // 201, not 200: `StoriesController.publish` declares no `@HttpCode`, so it inherits Nest's POST
    // default. (`BooksController.publish` does declare `@HttpCode(HttpStatus.OK)`, so the two modules
    // disagree — asserted as shipped rather than "corrected" here, because the status code is not
    // what this test is about.)
    await request(context.httpServer)
      .post(`/stories/${publishedStoryId}/publish`)
      .set('Authorization', `Bearer ${author.accessToken}`)
      .send({})
      .expect(201);
  });

  afterAll(async () => {
    await context.close();
  });

  describe('POST /stories', () => {
    /**
     * The draft's shape is asserted on the CREATE response rather than on a follow-up read.
     *
     * The old version of this test re-read the new story with `GET /stories/${id}` and no
     * `Authorization` header, expecting 200 — it PINNED THE LEAK. `GET /stories/:id` and
     * `GET /stories/slug/:slug` are `@Public()` and filtered only on `deletedAt`, so anybody who knew
     * the id or the slug of an unpublished story could read it with no account, while
     * `GET /stories` had already been pinned to `published` (one rule, two answers).
     *
     * What that read is now, for an anonymous caller, is asserted below — 404. The properties this
     * test is actually about (created as a draft, owned by the caller, no views yet) are all on the
     * create response, which is `toRecord` rather than `toStoryResponse` and therefore carries
     * `authorId` and `viewCount`.
     */
    it('should create a new story as a draft owned by the caller', async () => {
      const created = await context.createStory(author.accessToken, { title: 'Just Created Draft' });

      expect(created.id).toEqual(expect.any(String));
      expect(created.title).toBe('Just Created Draft');
      expect(created.status).toBe('draft');
      expect(created.authorId).toBe(author.id);
      expect(created.viewCount).toBe(0);
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

      const body = res.body as MyStoriesListResponse;

      expect(body).toHaveProperty('stories');
      expect(Array.isArray(body.stories)).toBe(true);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
      expect(body.total).toBeGreaterThanOrEqual(1);

      // The list is an index of published content, so the story the author actually published has to
      // be in it — `total >= 1` on its own would also be satisfied by a row of somebody else's.
      const stories = body.stories as StoryListItemResponse[];
      expect(stories.map((story) => story.id)).toContain(publishedStoryId);
    });

    /**
     * THE REGRESSION PIN FOR THE LEAK THIS ROUTE USED TO HAVE.
     *
     * `GET /stories?status=draft` was an anonymous dump of every draft in the system — title,
     * excerpt and slug of other people's unpublished work, to a caller with no account. The route
     * now pins `status` to `published` and ignores the query parameter rather than rejecting it, so
     * the assertion has to be about the CONTENT of the response, not about a status code: a `400`
     * would also have been an acceptable fix and this test must pass for either. It asserts on an
     * unauthenticated request, because that is the population the leak reached.
     */
    it('should not return drafts to an anonymous caller even when the query asks for them', async () => {
      const res = await request(context.httpServer).get('/stories?status=draft&page=1&limit=100').expect(200);

      const body = res.body as MyStoriesListResponse;

      const stories = body.stories as StoryListItemResponse[];
      expect(stories.map((story) => story.id)).not.toContain(storyId);
      expect(stories.every((story) => story.status === 'published')).toBe(true);
    });
  });

  /**
   * `GET /stories/mine` — the route that makes a draft findable again.
   *
   * The defect this closes is the one the list route above could not: `GET /stories` is pinned to
   * `published`, so `POST /stories` answered 201 with an id that no caller, its author included, had any
   * way to list. `StoriesQueryDto` declared no `authorId` and the module had no authenticated list
   * route, while `findAll` had accepted `authorId` all along.
   *
   * The three cases below are the whole contract: the caller sees their own draft, they do not see
   * somebody else's, and an anonymous caller is refused. The first is the feature; the second and third
   * are what keep it from being the leak the list route used to be.
   */
  describe('GET /stories/mine', () => {
    it("should list the caller's own unpublished stories, which the public list cannot show", async () => {
      const res = await request(context.httpServer)
        .get('/stories/mine')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const body = res.body as MyStoriesListResponse;

      expect(body).toHaveProperty('stories');
      const stories = body.stories as StoryListItemResponse[];
      expect(stories.map((story) => story.id)).toContain(storyId);
      // Nothing on this route is reachable through `GET /stories`, so a published row here would mean
      // the status filter had stopped being one.
      expect(stories.every((story) => story.status !== 'published')).toBe(true);
    });

    it("should not disclose another author's draft", async () => {
      const stranger = await context.registerAndLogin({ prefix: 'minestrange' });
      const strangerDraft = await context.createStory(stranger.accessToken, { title: 'Stranger Draft' });

      const res = await request(context.httpServer)
        .get('/stories/mine')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const body = res.body as MyStoriesListResponse;

      const stories = body.stories as StoryListItemResponse[];
      expect(stories.map((story) => story.id)).not.toContain(strangerDraft.id);
      expect(JSON.stringify(res.body)).not.toContain('Stranger Draft');
    });

    it('should refuse a caller-supplied authorId instead of listing that account', async () => {
      const stranger = await context.registerAndLogin({ prefix: 'minebyid' });
      const strangerDraft = await context.createStory(stranger.accessToken, { title: 'Draft By Id Probe' });

      // `MyStoriesQueryDto` declares no `authorId`, so the production pipe's `forbidNonWhitelisted`
      // turns the attempt into a 400. This is the assertion that distinguishes this route shape from
      // the alternative — an `authorId` field on the `@Public()` list, where the same request would
      // have been a successful dump of another account's drafts.
      await request(context.httpServer)
        .get(`/stories/mine?authorId=${stranger.id}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(400);

      const strangerView = await request(context.httpServer)
        .get('/stories/mine')
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(200);
      const strangerViewBody = strangerView.body as MyStoriesListResponse;
      expect((strangerViewBody.stories as StoryListItemResponse[]).map((story) => story.id)).toContain(strangerDraft.id);
    });

    it('should refuse an anonymous caller', async () => {
      await request(context.httpServer).get('/stories/mine').expect(401);
    });

    it('should narrow to one unpublished status and refuse to list published work here', async () => {
      const archived = await context.createStory(author.accessToken, { title: 'Archived For Narrowing' });
      await request(context.httpServer)
        .post(`/stories/${archived.id}/archive`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({})
        .expect(201);

      const narrowed = await request(context.httpServer)
        .get('/stories/mine?status=archived')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const narrowedBody = narrowed.body as MyStoriesListResponse;

      const stories = narrowedBody.stories as StoryListItemResponse[];
      expect(stories.every((story) => story.status === 'archived')).toBe(true);
      expect(stories.map((story) => story.id)).toContain(archived.id);
      // The draft is still there, it is simply not an archived story.
      expect(stories.map((story) => story.id)).not.toContain(storyId);

      // `published` is a different question, answered by `GET /stories`; a 400 keeps this route from
      // answering it under a contract that promises unpublished work.
      await request(context.httpServer)
        .get('/stories/mine?status=published')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(400);
    });

    it('should include an archived story, which is unpublished and not deleted', async () => {
      const archived = await context.createStory(author.accessToken, { title: 'Archived Is Unpublished' });
      await request(context.httpServer)
        .post(`/stories/${archived.id}/archive`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({})
        .expect(201);

      const res = await request(context.httpServer)
        .get('/stories/mine')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const body = res.body as MyStoriesListResponse;

      expect((body.stories as StoryListItemResponse[]).map((story) => story.id)).toContain(archived.id);
    });

    /**
     * Route order, with the database in front of it. `@Get(':id')` declared above `@Get('mine')` binds
     * `id="mine"`, `StoriesRepository.findById` swallows Postgres `22P02` to `null`, and the answer is a
     * 404 that reads exactly like an author with no drafts — the defect returning in its original form.
     */
    it('should not let the :id route capture the literal `mine` segment', async () => {
      const res = await request(context.httpServer)
        .get('/stories/mine')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const body = res.body as MyStoriesListResponse;

      expect(Array.isArray(body.stories)).toBe(true);
      expect((body.stories as StoryListItemResponse[]).map((story) => story.id)).toContain(storyId);
    });
  });

  /**
   * THE UNPUBLISHED-STORY RULE ON THE DETAIL ROUTE.
   *
   * `GET /stories/:id` is `@Public()` and `StoriesService.findById` filtered only on `deletedAt`, so
   * any draft or archived story was readable by id with no account — while `GET /stories` was
   * already pinned to `published`. One rule, two answers; this block is the second half.
   *
   * The rule now: unpublished work is readable by its author and by a content moderator, and by
   * nobody else — including an authenticated stranger. Everyone else gets 404 rather than 403,
   * because a 403 confirms the story exists and turns the route into an oracle for enumerating
   * unpublished work by id.
   *
   * The author case is asserted FIRST on purpose. It populates `cache:story:<id>`, so the anonymous
   * 404 that follows is served from the cache with the loader never running — which is the only
   * ordering that proves a cached draft cannot leak.
   */
  describe('GET /stories/:id', () => {
    it('should let the author read their own draft', async () => {
      const res = await request(context.httpServer)
        .get(`/stories/${storyId}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const body = res.body as StoryDetail;
      expect(body.id).toBe(storyId);
      expect(body.title).toBe(originalTitle);
      expect(body.status).toBe('draft');
      expect(body.author.id).toBe(author.id);
    });

    it('should not disclose an unpublished story to an anonymous caller', async () => {
      const res = await request(context.httpServer).get(`/stories/${storyId}`).expect(404);

      // Identical to the answer for an id that was never used, so the status code carries no
      // information: "not for you" and "not there" must not be distinguishable.
      expect(res.body.message).toBe('Story not found');
      expect(JSON.stringify(res.body)).not.toContain(originalTitle);
    });

    it('should not disclose an unpublished story to an authenticated stranger', async () => {
      const stranger = await context.registerAndLogin({ prefix: 'draftstranger' });

      const res = await request(context.httpServer)
        .get(`/stories/${storyId}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      expect(res.body.message).toBe('Story not found');
    });

    it('should let a content moderator read an unpublished story they did not write', async () => {
      const moderator = await context.registerAndLogin({ prefix: 'draftmod' });
      await context.promoteToAdmin(moderator.id, AdminRole.CONTENT_MODERATOR);
      // The promotion has to be followed by a fresh login: the token minted at registration still
      // carries `accountType: reader`, and the permission table is read from the verified claims.
      const tokens = await context.login(moderator.email);

      await request(context.httpServer)
        .get(`/stories/${storyId}`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
    });

    it('should downgrade a credential that cannot be verified to anonymous, not 401', async () => {
      // This was 401, and that was wrong for this client. `api.ts` authenticates with the
      // httpOnly `access_token` cookie and never sets a header; the cookie lives 15 minutes. So every
      // reader who browses past that boundary holds a stale cookie, and a 401 on a `@Public()` route
      // reaches `handleResponse`, which clears the stored user — signing them out mid-read of a
      // published story.
      //
      // `storyId` is the DRAFT, so the anonymous answer here is 404. That is the sharper form of the
      // assertion: the unverifiable credential is neither honoured (no 200) nor refused (no 401) — it
      // produces byte-for-byte the answer an anonymous caller gets, which is the whole security
      // property. `JwtAuthGuard` still answers 401 for the same token on any route that requires auth.
      await request(context.httpServer)
        .get(`/stories/${storyId}`)
        .set('Authorization', 'Bearer not-a-verifiable-token')
        .expect(404);
    });

    it('should return 404 when story not found', async () => {
      await request(context.httpServer).get('/stories/00000000-0000-0000-0000-000000000000').expect(404);
    });
  });

  /**
   * The same three-way rule on the slug route.
   *
   * `GET /stories/slug/:slug` is the SECOND key onto the same row, and it was `@Public()` too. A fix
   * applied to the id route alone would leave every draft readable by slug — which is the more
   * guessable of the two keys for anything whose title is known, since slugs are derived from it.
   * Asserted separately because a route is a route: "one rule, two answers" is the failure mode that
   * produced this defect.
   */
  describe('GET /stories/slug/:slug', () => {
    it('should let the author read their own draft by slug', async () => {
      const res = await request(context.httpServer)
        .get(`/stories/slug/${storySlug}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const body = res.body as StoryDetail;
      expect(body.id).toBe(storyId);
      expect(body.slug).toBe(storySlug);
      expect(body.status).toBe('draft');
    });

    it('should not disclose an unpublished story to an anonymous caller', async () => {
      const res = await request(context.httpServer).get(`/stories/slug/${storySlug}`).expect(404);

      expect(res.body.message).toBe('Story not found');
      expect(JSON.stringify(res.body)).not.toContain(originalTitle);
    });

    it('should not disclose an unpublished story to an authenticated stranger', async () => {
      const stranger = await context.registerAndLogin({ prefix: 'slugstranger' });

      const res = await request(context.httpServer)
        .get(`/stories/slug/${storySlug}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      expect(res.body.message).toBe('Story not found');
    });

    it('should still resolve a published story by slug for an anonymous caller', async () => {
      // The rule is about STATUS, not about the slug key: closing the draft route must not close the
      // public one, or the published story this file created would become unreadable.
      const published = await context.createStory(author.accessToken, {
        title: 'Slug Route Published',
        slug: context.uniqueSlug('published-slug'),
      });
      await request(context.httpServer)
        .post(`/stories/${published.id}/publish`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({})
        .expect(201);

      const res = await request(context.httpServer).get(`/stories/slug/${published.slug}`).expect(200);

      expect((res.body as StoryDetail).status).toBe('published');
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

  /**
   * `POST /stories/:id/view` USED TO BE A DRAFT-EXISTENCE ORACLE.
   *
   * It took no request and no viewer and incremented for any id that existed, so a 204 confirmed
   * "there is a draft at this id" to any authenticated account — the same class of disclosure the
   * detail routes were closed against, reachable for one cheap `POST`. It now applies the one rule
   * (`assertStoryIsReadableBy`, the helper the detail routes use), so the refusal is byte-identical to
   * the one a nonexistent id produces. Both answers are captured here and compared, because a refusal
   * that merely had the right status code would still be an oracle.
   */
  describe('POST /stories/:id/view', () => {
    it('should refuse a view count on an unpublished story, with the same answer the detail route gives', async () => {
      const stranger = await context.registerAndLogin({ prefix: 'viewstranger' });

      const view = await request(context.httpServer)
        .post(`/stories/${storyId}/view`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      const detail = await request(context.httpServer)
        .get(`/stories/${storyId}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      expect(view.body.message).toBe('Story not found');
      expect(view.body).toEqual(detail.body);
    });

    it('should not increment the counter for a refused unpublished story', async () => {
      const stranger = await context.registerAndLogin({ prefix: 'viewcount' });
      const draft = await context.createStory(author.accessToken, { title: 'View Refused Draft' });

      await request(context.httpServer)
        .post(`/stories/${draft.id}/view`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      const res = await request(context.httpServer)
        .get(`/stories/${draft.id}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      expect((res.body as StoryDetail).views).toBe(0);
    });

    /**
     * The case that must keep working. A published story is readable by anyone, so any authenticated
     * reader still counts a view on one — 204, no body, and the counter really moves. This is also the
     * pin that the visibility check is not simply "must be the author".
     */
    it('should count a view on a published story for an ordinary authenticated reader', async () => {
      const stranger = await context.registerAndLogin({ prefix: 'viewreader' });

      const before = await request(context.httpServer).get(`/stories/${publishedStoryId}`).expect(200);
      const viewsBefore = (before.body as StoryDetail).views;

      const res = await request(context.httpServer)
        .post(`/stories/${publishedStoryId}/view`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(204);

      expect(res.body).toEqual({});

      const after = await request(context.httpServer).get(`/stories/${publishedStoryId}`).expect(200);
      expect((after.body as StoryDetail).views).toBe(viewsBefore + 1);
    });

    it('should let the author count a view on their own draft, which they may read', async () => {
      const draft = await context.createStory(author.accessToken, { title: 'Author Counts Own Draft' });

      await request(context.httpServer)
        .post(`/stories/${draft.id}/view`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(204);

      const res = await request(context.httpServer)
        .get(`/stories/${draft.id}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      expect((res.body as StoryDetail).views).toBe(1);
    });

    it('should still refuse an anonymous caller', async () => {
      await request(context.httpServer).post(`/stories/${publishedStoryId}/view`).expect(401);
    });

    it('should answer 404 for an id that was never used, exactly as before', async () => {
      const stranger = await context.registerAndLogin({ prefix: 'viewmissing' });

      await request(context.httpServer)
        .post('/stories/00000000-0000-0000-0000-000000000000/view')
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);
    });
  });
});
