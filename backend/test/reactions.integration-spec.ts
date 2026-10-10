import request from 'supertest';

import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext } from '../src/test/helpers/test-context.ts';
import type {
  ReactionResponse,
  ReactionsListResponse,
  ReactionStatsResponse,
  UserReactionResponse,
} from '../src/test/helpers/test-response-types.ts';

describe('Reactions Integration', () => {
  let context: TestContext;
  let authorToken: string;
  let storyId: string;
  let readerToken: string;

  beforeAll(async () => {
    context = await createTestContext();

    const author = await context.registerAndLogin({ prefix: 'reactionauthor' });
    authorToken = author.accessToken;
    const story = await context.createStory(authorToken, { title: 'Reactions Test Story' });
    storyId = story.id;

    const reader = await context.registerAndLogin({ prefix: 'reactionreader' });
    readerToken = reader.accessToken;
  });

  afterAll(async () => {
    await context.close();
  });

  const react = (type: string, token: string = authorToken) =>
    request(context.httpServer)
      .post(`/reactions/stories/${storyId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type });

  describe('POST /reactions/stories/:storyId', () => {
    it('should add a reaction to a story', async () => {
      const res = await react('like').expect(201);

      const body = res.body as ReactionResponse;

      expect(body).toHaveProperty('id');
      expect(body.userId).toBeDefined();
      expect(body.storyId).toBe(storyId);
      expect(body.type).toBe('like');
    });

    it('should update an existing reaction instead of duplicating it', async () => {
      await react('like').expect(201);

      const res = await react('love').expect(201);

      const body = res.body as ReactionResponse;

      expect(body.type).toBe('love');
      const list = await request(context.httpServer).get(`/reactions/stories/${storyId}`).expect(200);
      const listBody = list.body as ReactionsListResponse;
      expect(listBody.total).toBe(1);
    });
  });

  describe('DELETE /reactions/stories/:storyId', () => {
    it('should remove a reaction from a story', async () => {
      await react('like').expect(201);

      const res = await request(context.httpServer)
        .delete(`/reactions/stories/${storyId}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);

      const body = res.body as { message: string };
      expect(body).toHaveProperty('message');
    });
  });

  describe('GET /reactions/stories/:storyId', () => {
    it('should get reactions for a story', async () => {
      await react('like').expect(201);

      const res = await request(context.httpServer).get(`/reactions/stories/${storyId}`).expect(200);

      const body = res.body as ReactionsListResponse;

      expect(body).toHaveProperty('reactions');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.reactions)).toBe(true);
      expect(body.total).toBe(1);
    });
  });

  describe('GET /reactions/stories/:storyId/counts', () => {
    it('should get reaction counts for a story', async () => {
      await react('like').expect(201);

      const res = await request(context.httpServer).get(`/reactions/stories/${storyId}/counts`).expect(200);

      const body = res.body as ReactionStatsResponse;

      expect(body).toHaveProperty('like');
      expect(body.like).toBe(1);
    });
  });

  describe('GET /reactions/stories/:storyId/me', () => {
    it('should return the current user reaction', async () => {
      await react('like').expect(201);

      const res = await request(context.httpServer)
        .get(`/reactions/stories/${storyId}/me`)
        .set('Authorization', `Bearer ${authorToken}`)
        .expect(200);

      const body = res.body as UserReactionResponse;

      expect(body).toHaveProperty('type');
      expect(body.type).toBe('like');
    });

    it('should return 200 with an empty payload when the user has no reaction', async () => {
      const res = await request(context.httpServer)
        .get(`/reactions/stories/${storyId}/me`)
        .set('Authorization', `Bearer ${readerToken}`)
        .expect(200);

      expect(res.text).toBe('');
      expect(res.body).toEqual({});
    });
  });
});
