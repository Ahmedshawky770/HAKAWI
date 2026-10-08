import request from 'supertest';

import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext, TestUser } from '../src/test/helpers/test-context.ts';
import type {
  ConversationResponse,
  ConversationsListResponse,
  MessageResponse,
  MessagesListResponse,
} from '../src/test/helpers/test-response-types.ts';

describe('Messages Integration', () => {
  let context: TestContext;
  let sender: TestUser;
  let recipient: TestUser;

  beforeAll(async () => {
    context = await createTestContext();
    sender = await context.registerAndLogin({ prefix: 'sender' });
    recipient = await context.registerAndLogin({ prefix: 'recipient' });
  });

  afterAll(async () => {
    await context.close();
  });

  describe('POST /messages/conversations', () => {
    it('should create a conversation', async () => {
      const res = await request(context.httpServer)
        .post('/messages/conversations')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ participantIds: [recipient.id] })
        .expect(201);

      const body = res.body as ConversationResponse;

      expect(body).toHaveProperty('id');
      expect([body.participant1.id, body.participant2.id]).toEqual(
        expect.arrayContaining([sender.id, recipient.id]),
      );
    });
  });

  describe('GET /messages/conversations', () => {
    it('should get conversations for current user', async () => {
      await request(context.httpServer)
        .post('/messages/conversations')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ participantIds: [recipient.id] })
        .expect(201);

      const res = await request(context.httpServer)
        .get('/messages/conversations')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .expect(200);

      const body = res.body as ConversationsListResponse;

      expect(body).toHaveProperty('conversations');
      expect(Array.isArray(body.conversations)).toBe(true);
      expect(body.conversations.length).toBeGreaterThanOrEqual(1);
    });

    it('should not leak conversations the user is not part of', async () => {
      const outsider = await context.registerAndLogin({ prefix: 'outsider' });

      const res = await request(context.httpServer)
        .get('/messages/conversations')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(200);

      const body = res.body as ConversationsListResponse;

      expect(body.conversations).toEqual([]);
    });
  });

  describe('GET /messages/conversations/:conversationId/messages', () => {
    it('should get messages for a conversation', async () => {
      const conversationRes = await request(context.httpServer)
        .post('/messages/conversations')
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ participantIds: [recipient.id] })
        .expect(201);

      const conversationId: string = conversationRes.body.id;

      const empty = await request(context.httpServer)
        .get(`/messages/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .expect(200);

      const emptyBody = empty.body as MessagesListResponse;

      expect(emptyBody.messages).toEqual([]);

      await request(context.httpServer)
        .post(`/messages/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .send({ content: 'Hello from the integration suite' })
        .expect(201);

      const res = await request(context.httpServer)
        .get(`/messages/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${sender.accessToken}`)
        .expect(200);

      const body = res.body as MessagesListResponse;

      expect(body).toHaveProperty('messages');
      expect(body.messages.length).toBe(1);
      expect(body.messages[0].content).toBe('Hello from the integration suite');
    });
  });
});
