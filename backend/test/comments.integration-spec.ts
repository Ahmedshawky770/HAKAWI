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

      expect(res.body).toHaveProperty('id');
      expect(res.body.authorId).toBe(authorId);
      expect(res.body.storyId).toBe(storyId);
      expect(res.body.content).toBe('Great story!');

      commentId = res.body.id;
    });
  });

  describe('GET /comments/story/:storyId', () => {
    it('should list the top-level comments of a story', async () => {
      const res = await request(context.httpServer).get(`/comments/story/${storyId}`).expect(200);

      expect(res.body).toHaveProperty('comments');
      expect(Array.isArray(res.body.comments)).toBe(true);
      expect(res.body.total).toBe(1);
      expect(res.body.comments[0].id).toBe(commentId);
    });

    it('should return an empty list for a story without comments', async () => {
      const other = await context.createStory(accessToken, { title: 'Uncommented Story' });

      const res = await request(context.httpServer).get(`/comments/story/${other.id}`).expect(200);

      expect(res.body.comments).toEqual([]);
      expect(res.body.total).toBe(0);
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
      rootCommentId = root.body.id;

      const reply = await request(context.httpServer)
        .post('/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ storyId: threadedStoryId, content: 'A reply', parentId: rootCommentId })
        .expect(201);
      replyCommentId = reply.body.id;

      const doomed = await request(context.httpServer)
        .post('/comments')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ storyId: threadedStoryId, content: 'About to be deleted' })
        .expect(201);
      deletedCommentId = doomed.body.id;

      await request(context.httpServer)
        .delete(`/comments/${deletedCommentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should list the root comment while excluding replies and soft-deleted comments', async () => {
      const res = await request(context.httpServer).get(`/comments/story/${threadedStoryId}`).expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.comments).toHaveLength(1);
      expect(res.body.comments[0].id).toBe(rootCommentId);
      expect(res.body.comments.map((c: { id: string }) => c.id)).not.toContain(replyCommentId);
      expect(res.body.comments.map((c: { id: string }) => c.id)).not.toContain(deletedCommentId);
    });

    it('should list replies under their parent', async () => {
      const res = await request(context.httpServer).get(`/comments/${rootCommentId}/replies`).expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.replies).toHaveLength(1);
      expect(res.body.replies[0].id).toBe(replyCommentId);
    });

    it('should hide a soft-deleted reply from its parent thread', async () => {
      await request(context.httpServer)
        .delete(`/comments/${replyCommentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const res = await request(context.httpServer).get(`/comments/${rootCommentId}/replies`).expect(200);

      expect(res.body.total).toBe(0);
      expect(res.body.replies).toEqual([]);
    });
  });

  describe('PATCH /comments/:commentId', () => {
    it('should update a comment', async () => {
      const res = await request(context.httpServer)
        .patch(`/comments/${commentId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ content: 'Updated comment' })
        .expect(200);

      expect(res.body.content).toBe('Updated comment');
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

      expect(res.body).toHaveProperty('message');

      const list = await request(context.httpServer).get(`/comments/story/${storyId}`).expect(200);
      expect(list.body.total).toBe(0);
    });
  });
});
