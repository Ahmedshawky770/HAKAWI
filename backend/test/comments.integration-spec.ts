import request from 'supertest';

import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext } from '../src/test/helpers/test-context.ts';
import type {
  CommentResponse,
  CommentsListResponse,
  CommentRepliesResponse,
  CommentDeleteResponse,
} from '../src/test/helpers/test-response-types.ts';

describe('Comments Integration', () => {
  let context: TestContext;
  let accessToken: string;
  let authorId: string;
  let storyId: string;
  let commentId: string;

  beforeAll(async () => {
    context = await createTestContext();
    const author = await context.registerAndLogin({ prefix: 'commenter' });
    accessToken = author.accessToken;
    authorId = author.id;

    const story = await context.createStory(accessToken, { title: 'Comments Test Story' });
    storyId = story.id;
  });

  afterAll(async () => {
    await context.close();
  });

  describe('POST /comments', () => {
    it('should add a comment to a story', async () => {
      const res = await request(context.httpServer)
        .post('/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ storyId, content: 'Great story!' })
        .expect(201);

      const body = res.body as CommentResponse;

      expect(body).toHaveProperty('id');
      expect(body.authorId).toBe(authorId);
      expect(body.storyId).toBe(storyId);
      expect(body.content).toBe('Great story!');

      commentId = body.id;
    });
  });

  describe('GET /comments/story/:storyId', () => {
    it('should list the top-level comments of a story', async () => {
      const res = await request(context.httpServer).get(`/comments/story/${storyId}`).expect(200);

      const body = res.body as CommentsListResponse;

      expect(body).toHaveProperty('comments');
      expect(Array.isArray(body.comments)).toBe(true);
      expect(body.total).toBe(1);
      expect(body.comments[0].id).toBe(commentId);
    });

    it('should return an empty list for a story without comments', async () => {
      const other = await context.createStory(accessToken, { title: 'Uncommented Story' });

      const res = await request(context.httpServer).get(`/comments/story/${other.id}`).expect(200);

      const body = res.body as CommentsListResponse;

      expect(body.comments).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  // Regression guard for the `eq(parentId, null)` defect: that predicate compiled to
  // `parent_id = NULL`, so every listing below returned zero rows in production.
  describe('threading and soft-delete visibility', () => {
    let threadedStoryId: string;
    let rootCommentId: string;
    let replyCommentId: string;
    let deletedCommentId: string;

    beforeAll(async () => {
      threadedStoryId = (await context.createStory(accessToken, { title: 'Threaded Story' })).id;

      const root = await request(context.httpServer)
        .post('/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ storyId: threadedStoryId, content: 'Root comment' })
        .expect(201);
      const rootBody = root.body as CommentResponse;
      rootCommentId = rootBody.id;

      const reply = await request(context.httpServer)
        .post('/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ storyId: threadedStoryId, content: 'A reply', parentId: rootCommentId })
        .expect(201);
      const replyBody = reply.body as CommentResponse;
      replyCommentId = replyBody.id;

      const doomed = await request(context.httpServer)
        .post('/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ storyId: threadedStoryId, content: 'About to be deleted' })
        .expect(201);
      const doomedBody = doomed.body as CommentResponse;
      deletedCommentId = doomedBody.id;

      await request(context.httpServer)
        .delete(`/comments/${deletedCommentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should list the root comment while excluding replies and soft-deleted comments', async () => {
      const res = await request(context.httpServer).get(`/comments/story/${threadedStoryId}`).expect(200);

      const body = res.body as CommentsListResponse;

      expect(body.total).toBe(1);
      expect(body.comments).toHaveLength(1);
      expect(body.comments[0].id).toBe(rootCommentId);
      expect(body.comments.map((c) => c.id)).not.toContain(replyCommentId);
      expect(body.comments.map((c) => c.id)).not.toContain(deletedCommentId);
    });

    it('should list replies under their parent', async () => {
      const res = await request(context.httpServer).get(`/comments/${rootCommentId}/replies`).expect(200);

      const body = res.body as CommentRepliesResponse;

      expect(body.total).toBe(1);
      expect(body.replies).toHaveLength(1);
      expect(body.replies[0].id).toBe(replyCommentId);
    });

    it('should hide a soft-deleted reply from its parent thread', async () => {
      await request(context.httpServer)
        .delete(`/comments/${replyCommentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const res = await request(context.httpServer).get(`/comments/${rootCommentId}/replies`).expect(200);

      const body = res.body as CommentRepliesResponse;

      expect(body.total).toBe(0);
      expect(body.replies).toEqual([]);
    });
  });

  describe('PATCH /comments/:commentId', () => {
    it('should update a comment', async () => {
      const res = await request(context.httpServer)
        .patch(`/comments/${commentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ content: 'Updated comment' })
        .expect(200);

      const body = res.body as CommentResponse;

      expect(body.content).toBe('Updated comment');
    });

    it('should reject an update from a different author', async () => {
      const stranger = await context.registerAndLogin({ prefix: 'stranger' });

      await request(context.httpServer)
        .patch(`/comments/${commentId}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ content: 'Hijacked' })
        .expect(403);
    });
  });

  describe('DELETE /comments/:commentId', () => {
    it('should delete a comment', async () => {
      const res = await request(context.httpServer)
        .delete(`/comments/${commentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = res.body as CommentDeleteResponse;

      expect(body).toHaveProperty('message');

      const list = await request(context.httpServer).get(`/comments/story/${storyId}`).expect(200);

      const listBody = list.body as CommentsListResponse;
      expect(listBody.total).toBe(0);
    });
  });
});
