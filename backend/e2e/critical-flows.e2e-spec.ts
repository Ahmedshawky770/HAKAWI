import { test, expect } from '@playwright/test';

test.describe('Critical Flows E2E', () => {
  test.describe('Register → Login → Create Story → Publish → Search', () => {
    test('should complete full story publishing flow', async ({ request }) => {
      const uniqueEmail = `e2e-${Date.now()}@example.com`;
      const uniqueUsername = `e2euser${Date.now()}`;

      const registerRes = await request.post('http://localhost:3001/api/v1/auth/register', {
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
      expect(registerBody.user.email).toBe(uniqueEmail);

      const createStoryRes = await request.post('http://localhost:3001/api/v1/stories', {
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

      const publishRes = await request.post(`http://localhost:3001/api/v1/stories/${storyId}/publish`, {
        data: {},
      });

      expect(publishRes.ok()).toBeTruthy();
      const publishBody = await publishRes.json();
      expect(publishBody.status).toBe('published');
      expect(publishBody.publishedAt).not.toBeNull();

      const searchRes = await request.get('http://localhost:3001/api/v1/search?query=E2E+Test+Story');

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

      const registerRes1 = await request.post('http://localhost:3001/api/v1/auth/register', {
        data: {
          email: user1Email,
          password: 'SecurePass123!',
          name: 'Social User 1',
          username: `social1_${Date.now()}`,
        },
      });

      expect(registerRes1.ok()).toBeTruthy();
      const user1 = await registerRes1.json();
      const user1Id = user1.user.id;

      const registerRes2 = await request.post('http://localhost:3001/api/v1/auth/register', {
        data: {
          email: user2Email,
          password: 'SecurePass123!',
          name: 'Social User 2',
          username: `social2_${Date.now()}`,
        },
      });

      expect(registerRes2.ok()).toBeTruthy();
      const user2 = await registerRes2.json();
      const user2Id = user2.user.id;

      const storyRes = await request.post('http://localhost:3001/api/v1/stories', {
        data: {
          title: 'Social Test Story',
          slug: `social-test-story-${Date.now()}`,
          content: '<p>Social content</p>',
        },
      });

      expect(storyRes.ok()).toBeTruthy();
      const story = await storyRes.json();
      const storyId = story.id;

      await request.post(`http://localhost:3001/api/v1/stories/${storyId}/publish`, {
        data: {},
      });

      const followRes = await request.post('http://localhost:3001/api/v1/follows', {
        data: {
          followingId: user1Id,
        },
      });

      expect(followRes.ok()).toBeTruthy();
      const followBody = await followRes.json();
      expect(followBody.followerId).toBe(user2Id);
      expect(followBody.followingId).toBe(user1Id);

      const reactionRes = await request.post(`http://localhost:3001/api/v1/reactions/stories/${storyId}`, {
        data: {
          type: 'like',
        },
      });

      expect(reactionRes.ok()).toBeTruthy();
      const reactionBody = await reactionRes.json();
      expect(reactionBody.type).toBe('like');
      expect(reactionBody.userId).toBe(user2Id);

      const commentRes = await request.post('http://localhost:3001/api/v1/comments', {
        data: {
          storyId,
          content: 'Great story!',
        },
      });

      expect(commentRes.ok()).toBeTruthy();
      const commentBody = await commentRes.json();
      expect(commentBody.content).toBe('Great story!');
      expect(commentBody.storyId).toBe(storyId);

      const notificationsRes = await request.get('http://localhost:3001/api/v1/notifications');

      expect(notificationsRes.ok()).toBeTruthy();
      const notificationsBody = await notificationsRes.json();
      expect(notificationsBody).toHaveProperty('notifications');
    });
  });

  test.describe('Send message → Read message', () => {
    test('should complete messaging flow', async ({ request }) => {
      const user1Email = `msg1-${Date.now()}@example.com`;
      const user2Email = `msg2-${Date.now()}@example.com`;

      const registerRes1 = await request.post('http://localhost:3001/api/v1/auth/register', {
        data: {
          email: user1Email,
          password: 'SecurePass123!',
          name: 'Msg User 1',
          username: `msg1_${Date.now()}`,
        },
      });

      expect(registerRes1.ok()).toBeTruthy();
      const user1 = await registerRes1.json();
      const user1Id = user1.user.id;

      const registerRes2 = await request.post('http://localhost:3001/api/v1/auth/register', {
        data: {
          email: user2Email,
          password: 'SecurePass123!',
          name: 'Msg User 2',
          username: `msg2_${Date.now()}`,
        },
      });

      expect(registerRes2.ok()).toBeTruthy();
      const user2 = await registerRes2.json();
      const user2Id = user2.user.id;

      const conversationRes = await request.post('http://localhost:3001/api/v1/messages/conversations', {
        data: {
          recipientId: user2Id,
        },
      });

      expect(conversationRes.ok()).toBeTruthy();
      const conversationBody = await conversationRes.json();
      expect(conversationBody).toHaveProperty('id');
      const conversationId = conversationBody.id;

      const messageRes = await request.post(`http://localhost:3001/api/v1/messages/conversations/${conversationId}/messages`, {
        data: {
          content: 'Hello from E2E!',
        },
      });

      expect(messageRes.ok()).toBeTruthy();
      const messageBody = await messageRes.json();
      expect(messageBody.content).toBe('Hello from E2E!');
      expect(messageBody.senderId).toBe(user1Id);
      const messageId = messageBody.id;

      const readRes = await request.patch(`http://localhost:3001/api/v1/messages/messages/${messageId}/read`, {
        data: {},
      });

      expect(readRes.ok()).toBeTruthy();
      const readBody = await readRes.json();
      expect(readBody.isRead).toBe(true);

      const messagesRes = await request.get(`http://localhost:3001/api/v1/messages/conversations/${conversationId}/messages`);

      expect(messagesRes.ok()).toBeTruthy();
      const messagesBody = await messagesRes.json();
      expect(messagesBody).toHaveProperty('messages');
      expect(messagesBody.messages.length).toBeGreaterThan(0);
      expect(messagesBody.messages[0].content).toBe('Hello from E2E!');
    });
  });

  test.describe('عملية شراء كتاب → ويب هوك → التحقق من الدفع', () => {
    let bookId: string;
    let sellerContext: { token: string; userId: string };
    let buyerContext: { token: string; userId: string };
    let orderId: string;

    test('should complete purchase webhook and rental flow', async ({ request }) => {
      const sellerEmail = `seller-${Date.now()}@example.com`;
      const buyerEmail = `buyer-${Date.now()}@example.com`;

      const sellerRegisterRes = await request.post('http://localhost:3001/api/v1/auth/register', {
        data: {
          email: sellerEmail,
          password: 'SecurePass123!',
          name: 'Seller User',
          username: `seller_${Date.now()}`,
        },
      });

      expect(sellerRegisterRes.ok()).toBeTruthy();
      const seller = await sellerRegisterRes.json();
      sellerContext = { token: seller.tokens.accessToken, userId: seller.user.id };

      const buyerRegisterRes = await request.post('http://localhost:3001/api/v1/auth/register', {
        data: {
          email: buyerEmail,
          password: 'SecurePass123!',
          name: 'Buyer User',
          username: `buyer_${Date.now()}`,
        },
      });

      expect(buyerRegisterRes.ok()).toBeTruthy();
      const buyer = await buyerRegisterRes.json();
      buyerContext = { token: buyer.tokens.accessToken, userId: buyer.user.id };

      const bookRes = await request.post('http://localhost:3001/api/v1/books', {
        headers: { Authorization: `Bearer ${sellerContext.token}` },
        data: {
          title: `E2E Payment Book ${Date.now()}`,
          author: 'Test Author',
          price: 1000,
          isFree: false,
        },
      });

      expect(bookRes.ok()).toBeTruthy();
      const book = await bookRes.json();
      bookId = book.id;

      const purchaseRes = await request.post(`http://localhost:3001/api/v1/books/${bookId}/purchase`, {
        headers: { Authorization: `Bearer ${buyerContext.token}` },
      });

      expect(purchaseRes.ok()).toBeTruthy();
      const purchaseBody = await purchaseRes.json();
      expect(purchaseBody).toHaveProperty('paymentId');
      expect(purchaseBody).toHaveProperty('paymobUrl');
      orderId = purchaseBody.paymentId;

      const paymentsRes = await request.get('http://localhost:3001/api/v1/payments', {
        headers: { Authorization: `Bearer ${buyerContext.token}` },
      });

      expect(paymentsRes.ok()).toBeTruthy();
      const paymentsBody = await paymentsRes.json();
      expect(paymentsBody).toHaveProperty('payments');
      expect(paymentsBody.payments.length).toBeGreaterThan(0);
      const payment = paymentsBody.payments.find((p: { paymobOrderId: string }) => p.paymobOrderId === orderId);
      expect(payment).toBeDefined();
      expect(payment.status).toBe('processing');

      const webhookRes = await request.post('http://localhost:3001/api/v1/payments/webhooks/paymob', {
        data: {
          transaction_id: `txn-${Date.now()}`,
          order_id: orderId,
          status: 'success',
          payment_id: `paymob-${Date.now()}`,
        },
      });

      expect(webhookRes.ok()).toBeTruthy();
      const webhookBody = await webhookRes.json();
      expect(webhookBody.status).toBe('processed');

      const paymentsAfterRes = await request.get('http://localhost:3001/api/v1/payments', {
        headers: { Authorization: `Bearer ${buyerContext.token}` },
      });

      expect(paymentsAfterRes.ok()).toBeTruthy();
      const paymentsAfterBody = await paymentsAfterRes.json();
      const updatedPayment = paymentsAfterBody.payments.find((p: { paymobOrderId: string }) => p.paymobOrderId === orderId);
      expect(updatedPayment).toBeDefined();
      expect(updatedPayment.status).toBe('completed');

      const rentalRes = await request.post('http://localhost:3001/api/v1/rentals', {
        headers: { Authorization: `Bearer ${buyerContext.token}` },
        data: {
          bookId,
          durationDays: 7,
        },
      });

      expect(rentalRes.ok()).toBeTruthy();
      const rentalBody = await rentalRes.json();
      expect(rentalBody).toHaveProperty('id');
      expect(rentalBody.status).toBe('active');
      const rentalId = rentalBody.id;

      const rentalsRes = await request.get('http://localhost:3001/api/v1/rentals/my', {
        headers: { Authorization: `Bearer ${buyerContext.token}` },
      });

      expect(rentalsRes.ok()).toBeTruthy();
      const rentalsBody = await rentalsRes.json();
      expect(rentalsBody).toHaveProperty('rentals');
      expect(rentalsBody.rentals.length).toBeGreaterThan(0);
      expect(rentalsBody.rentals.some((r: { id: string }) => r.id === rentalId)).toBe(true);
    });

    test.afterAll(async ({ request }) => {
      if (bookId && sellerContext?.token) {
        await request.delete(`http://localhost:3001/api/v1/books/${bookId}`, {
          headers: { Authorization: `Bearer ${sellerContext.token}` },
        });
      }
    });
  });
});
