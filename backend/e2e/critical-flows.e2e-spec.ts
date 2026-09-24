import { test, expect } from '@playwright/test';

test.describe('Critical Flows E2E', () => {
  test.describe('Register → Login → Create Story → Publish → Search', () => {
    test('should complete full story publishing flow', async ({ request }) => {
      const uniqueEmail = `e2e-${Date.now()}@example.com`;
      const uniqueUsername = `e2euser${Date.now()}`;

      const registerRes = await request.post('/auth/register', {
        data: {
          email: uniqueEmail,
          password: 'SecurePass123!',
          name: 'E2E Test User',
          username: uniqueUsername,
        },
      });

      expect(registerRes.ok()).toBeTruthy();
      const registerBody = await registerRes.json();
      expect(registerBody).toHaveProperty('user');
      expect(registerBody).toHaveProperty('tokens');
      expect(registerBody.user.email).toBe(uniqueEmail);
      const accessToken = registerBody.tokens.accessToken;

      const loginRes = await request.post('/auth/login', {
        data: {
          email: uniqueEmail,
          password: 'SecurePass123!',
        },
      });

      expect(loginRes.ok()).toBeTruthy();
      const loginBody = await loginRes.json();
      expect(loginBody).toHaveProperty('tokens');
      expect(loginBody.tokens).toHaveProperty('accessToken');

      const createStoryRes = await request.post('/stories', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        data: {
          title: 'E2E Test Story',
          slug: `e2e-test-story-${Date.now()}`,
          content: '<p>This is an E2E test story.</p>',
          excerpt: 'E2E test excerpt',
        },
      });

      expect(createStoryRes.ok()).toBeTruthy();
      const storyBody = await createStoryRes.json();
      expect(storyBody).toHaveProperty('id');
      expect(storyBody.status).toBe('draft');
      const storyId = storyBody.id;

      const publishRes = await request.post(`/stories/${storyId}/publish`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(publishRes.ok()).toBeTruthy();
      const publishBody = await publishRes.json();
      expect(publishBody.status).toBe('published');
      expect(publishBody.publishedAt).not.toBeNull();

      const searchRes = await request.get('/search?query=E2E+Test+Story', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      expect(searchRes.ok()).toBeTruthy();
      const searchBody = await searchRes.json();
      expect(searchBody).toHaveProperty('results');
      expect(searchBody).toHaveProperty('total');
    });
  });

  test.describe('Follow user → React to story → Comment → Notification', () => {
    test('should complete social interaction flow', async ({ request }) => {
      const user1Email = `social1-${Date.now()}@example.com`;
      const user2Email = `social2-${Date.now()}@example.com`;

      const registerRes1 = await request.post('/auth/register', {
        data: {
          email: user1Email,
          password: 'SecurePass123!',
          name: 'Social User 1',
          username: `social1-${Date.now()}`,
        },
      });

      expect(registerRes1.ok()).toBeTruthy();
      const user1 = await registerRes1.json();
      const user1Token = user1.tokens.accessToken;
      const user1Id = user1.user.id;

      const registerRes2 = await request.post('/auth/register', {
        data: {
          email: user2Email,
          password: 'SecurePass123!',
          name: 'Social User 2',
          username: `social2-${Date.now()}`,
        },
      });

      expect(registerRes2.ok()).toBeTruthy();
      const user2 = await registerRes2.json();
      const user2Token = user2.tokens.accessToken;
      const user2Id = user2.user.id;

      const storyRes = await request.post('/stories', {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
        data: {
          title: 'Social Test Story',
          slug: `social-test-story-${Date.now()}`,
          content: '<p>Social content</p>',
        },
      });

      expect(storyRes.ok()).toBeTruthy();
      const story = await storyRes.json();
      const storyId = story.id;

      await request.post(`/stories/${storyId}/publish`, {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
      });

      const followRes = await request.post('/follows', {
        headers: {
          Authorization: `Bearer ${user2Token}`,
        },
        data: {
          followingId: user1Id,
        },
      });

      expect(followRes.ok()).toBeTruthy();
      const followBody = await followRes.json();
      expect(followBody.followerId).toBe(user2Id);
      expect(followBody.followingId).toBe(user1Id);

      const reactionRes = await request.post(`/reactions/stories/${storyId}`, {
        headers: {
          Authorization: `Bearer ${user2Token}`,
        },
        data: {
          type: 'like',
        },
      });

      expect(reactionRes.ok()).toBeTruthy();
      const reactionBody = await reactionRes.json();
      expect(reactionBody.type).toBe('like');
      expect(reactionBody.userId).toBe(user2Id);

      const commentRes = await request.post('/comments', {
        headers: {
          Authorization: `Bearer ${user2Token}`,
        },
        data: {
          storyId,
          content: 'Great story!',
        },
      });

      expect(commentRes.ok()).toBeTruthy();
      const commentBody = await commentRes.json();
      expect(commentBody.content).toBe('Great story!');
      expect(commentBody.storyId).toBe(storyId);

      const notificationsRes = await request.get('/notifications', {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
      });

      expect(notificationsRes.ok()).toBeTruthy();
      const notificationsBody = await notificationsRes.json();
      expect(notificationsBody).toHaveProperty('notifications');
    });
  });

  test.describe('Send message → Read message', () => {
    test('should complete messaging flow', async ({ request }) => {
      const user1Email = `msg1-${Date.now()}@example.com`;
      const user2Email = `msg2-${Date.now()}@example.com`;

      const registerRes1 = await request.post('/auth/register', {
        data: {
          email: user1Email,
          password: 'SecurePass123!',
          name: 'Msg User 1',
          username: `msg1-${Date.now()}`,
        },
      });

      expect(registerRes1.ok()).toBeTruthy();
      const user1 = await registerRes1.json();
      const user1Token = user1.tokens.accessToken;
      const user1Id = user1.user.id;

      const registerRes2 = await request.post('/auth/register', {
        data: {
          email: user2Email,
          password: 'SecurePass123!',
          name: 'Msg User 2',
          username: `msg2-${Date.now()}`,
        },
      });

      expect(registerRes2.ok()).toBeTruthy();
      const user2 = await registerRes2.json();
      const user2Token = user2.tokens.accessToken;
      const user2Id = user2.user.id;

      const conversationRes = await request.post('/messages/conversations', {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
        data: {
          recipientId: user2Id,
        },
      });

      expect(conversationRes.ok()).toBeTruthy();
      const conversationBody = await conversationRes.json();
      expect(conversationBody).toHaveProperty('id');
      const conversationId = conversationBody.id;

      const messageRes = await request.post(`/messages/conversations/${conversationId}/messages`, {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
        data: {
          content: 'Hello from E2E!',
        },
      });

      expect(messageRes.ok()).toBeTruthy();
      const messageBody = await messageRes.json();
      expect(messageBody.content).toBe('Hello from E2E!');
      expect(messageBody.senderId).toBe(user1Id);
      const messageId = messageBody.id;

      const readRes = await request.patch(`/messages/messages/${messageId}/read`, {
        headers: {
          Authorization: `Bearer ${user2Token}`,
        },
      });

      expect(readRes.ok()).toBeTruthy();
      const readBody = await readRes.json();
      expect(readBody.isRead).toBe(true);

      const messagesRes = await request.get(`/messages/conversations/${conversationId}/messages`, {
        headers: {
          Authorization: `Bearer ${user1Token}`,
        },
      });

      expect(messagesRes.ok()).toBeTruthy();
      const messagesBody = await messagesRes.json();
      expect(messagesBody).toHaveProperty('messages');
      expect(messagesBody.messages.length).toBeGreaterThan(0);
      expect(messagesBody.messages[0].content).toBe('Hello from E2E!');
    });
  });
});
