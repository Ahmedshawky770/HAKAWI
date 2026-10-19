import { sql } from 'drizzle-orm';
import request from 'supertest';

import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext, TestUser } from '../src/test/helpers/test-context.ts';
import { AccountType, AdminRole } from '../src/common/constants/roles.ts';
import { db } from '../src/db/index.ts';

describe('User Upgrade Flow E2E', () => {
  let context: TestContext;
  let adminUser: TestUser;
  let reader: TestUser;

  beforeAll(async () => {
    context = await createTestContext();
    adminUser = await context.registerAndLogin({ prefix: 'admin', name: 'Admin Officer' });
    await context.promoteToAdmin(adminUser.id, AdminRole.VERIFICATION_OFFICER);
    const tokens = await context.login(adminUser.email);
    adminUser = { ...adminUser, ...tokens };
  });

  afterAll(async () => {
    await context.close();
  });

  const verifyEmail = async (userId: string): Promise<void> => {
    await db.execute(sql`
      UPDATE users
      SET is_verified = true, email_verified = true
      WHERE id = ${userId}
    `);
  };

  // Sets view_count directly to simulate reads without N HTTP requests
  const simulateViews = async (userId: string, count: number): Promise<void> => {
    await db.execute(sql`
      UPDATE stories
      SET view_count = ${count}
      WHERE author_id = ${userId} AND status = 'published'
    `);
  };

  // Inserts reaction rows directly
  const simulateReactions = async (userId: string, storyId: string, count: number): Promise<void> => {
    // Get a pool of existing users (including the reader) who can react
    const reactors = await db.execute<{ id: string }>(sql`
      SELECT id FROM users WHERE id != ${userId} LIMIT ${count}
    `);
    if (reactors.rows.length < count) {
      // Create more users if needed
      const needed = count - reactors.rows.length;
      for (let i = 0; i < needed; i++) {
        const reactor = await context.registerUser({ prefix: `rx_${i}` });
        reactors.rows.push({ id: reactor.id });
      }
    }
    for (let i = 0; i < count; i++) {
      const reactorId = reactors.rows[i].id;
      await db.execute(sql`
        INSERT INTO reactions (story_id, user_id, type, created_at)
        VALUES (${storyId}, ${reactorId}, 'like', now())
      `);
    }
  };

  // Inserts follow rows directly
  const simulateFollowers = async (userId: string, count: number): Promise<void> => {
    // Get users who are not the target and not already following
    const followers = await db.execute<{ id: string }>(sql`
      SELECT id FROM users WHERE id != ${userId} LIMIT ${count}
    `);
    let needMore = false;
    if (followers.rows.length < count) {
      needMore = true;
    }
    if (needMore) {
      const needed = count - followers.rows.length;
      for (let i = 0; i < needed; i++) {
        const follower = await context.registerUser({ prefix: `fw_${i}` });
        followers.rows.push({ id: follower.id });
      }
    }
    for (let i = 0; i < count; i++) {
      const followerId = followers.rows[i].id;
      await db.execute(sql`
        INSERT INTO follows (follower_id, following_id, created_at)
        VALUES (${followerId}, ${userId}, now())
      `);
    }
  };

  describe('1. Reader → Rising Star (self-service)', () => {
    it('registers as reader with default account type', async () => {
      reader = await context.registerAndLogin({ prefix: 'reader', name: 'Reader User' });
      expect(reader.accountType).toBe(AccountType.READER);
    });

    it('rejects self-upgrade without verified email', async () => {
      await request(context.httpServer)
        .post('/users/me/upgrade')
        .set('Authorization', `Bearer ${reader.accessToken}`)
        .send({ target: 'rising_star' })
        .expect(400);
    });

    it('upgrades to rising_star after email verification', async () => {
      await verifyEmail(reader.id);
      const tokens = await context.login(reader.email);
      reader = { ...reader, ...tokens };

      const res = await request(context.httpServer)
        .post('/users/me/upgrade')
        .set('Authorization', `Bearer ${reader.accessToken}`)
        .send({ target: 'rising_star' })
        .expect(200);

      expect(res.body.accountType).toBe(AccountType.RISING_STAR);

      const me = await request(context.httpServer)
        .get('/users/me')
        .set('Authorization', `Bearer ${reader.accessToken}`)
        .expect(200);
      expect(me.body.accountType).toBe(AccountType.RISING_STAR);
    });

    it('rejects self-upgrade to publisher (institution only)', async () => {
      await request(context.httpServer)
        .post('/users/me/upgrade')
        .set('Authorization', `Bearer ${reader.accessToken}`)
        .send({ target: 'publisher' })
        .expect(400);
    });

    it('rejects self-upgrade to admin', async () => {
      await request(context.httpServer)
        .post('/users/me/upgrade')
        .set('Authorization', `Bearer ${reader.accessToken}`)
        .send({ target: 'admin' })
        .expect(400);
    });

    it('rejects upgrade without token', async () => {
      await request(context.httpServer)
        .post('/users/me/upgrade')
        .send({ target: 'rising_star' })
        .expect(401);
    });
  });

  describe('2. Eligibility check (professional-request)', () => {
    let category: { id: string };
    let publishedStoryId: string;

    it('creates a category as admin and 5 published stories', async () => {
      category = await context.createCategory(adminUser.accessToken, { name: 'UpgradeTest' });

      // Need published stories; createStory creates draft by default, so publish via DB
      for (let i = 0; i < 5; i++) {
        const story = await context.createStory(reader.accessToken, {
          title: `Story ${i + 1}`,
          content: `<p>Content ${i + 1}</p>`,
          categoryId: category.id,
        });
        // Publish all 5 stories
        await db.execute(sql`
          UPDATE stories
          SET status = 'published', published_at = now()
          WHERE id = ${story.id}
        `);
      }
      publishedStoryId = (
        await db.execute<{ id: string }>(
          sql`SELECT id FROM stories WHERE author_id = ${reader.id} AND status = 'published' LIMIT 1`,
        )
      ).rows[0]?.id;

      expect(publishedStoryId).toBeTruthy();

      const stats = await request(context.httpServer)
        .get(`/users/${reader.id}/stats`)
        .set('Authorization', `Bearer ${reader.accessToken}`)
        .expect(200);

      expect(stats.body.storiesCount).toBe(5);
    });

    it('simulates meeting view threshold (1000+ views)', async () => {
      await simulateViews(reader.id, 1000);
    });

    it('simulates meeting reaction threshold (100+ reactions)', async () => {
      expect(publishedStoryId).toBeTruthy();
      await simulateReactions(reader.id, publishedStoryId, 100);
    });

    it('simulates meeting follower threshold (50+ followers)', async () => {
      await simulateFollowers(reader.id, 50);
    });

    it('shows eligible=true once all thresholds met', async () => {
      const res = await request(context.httpServer)
        .post('/users/me/professional-request')
        .set('Authorization', `Bearer ${reader.accessToken}`)
        .expect(200);

      expect(res.body.eligible).toBe(true);
      expect(res.body.reasons).toEqual([]);
    });
  });

  describe('3. Professional approval (admin / verification_officer)', () => {
    it('promotes rising_star to professional via admin PATCH', async () => {
      const res = await request(context.httpServer)
        .patch(`/users/${reader.id}`)
        .set('Authorization', `Bearer ${adminUser.accessToken}`)
        .send({ accountType: AccountType.PROFESSIONAL })
        .expect(200);

      expect(res.body.accountType).toBe(AccountType.PROFESSIONAL);
    });

    it('verifies the user is now professional', async () => {
      const res = await request(context.httpServer)
        .get('/users/me')
        .set('Authorization', `Bearer ${reader.accessToken}`)
        .expect(200);

      expect(res.body.accountType).toBe(AccountType.PROFESSIONAL);
    });

    it('non-admin user cannot promote another user to admin', async () => {
      const nonAdmin = await context.registerAndLogin({ prefix: 'regular', name: 'Regular User' });

      await request(context.httpServer)
        .patch(`/users/${reader.id}`)
        .set('Authorization', `Bearer ${nonAdmin.accessToken}`)
        .send({ accountType: AccountType.ADMIN })
        .expect(403);
    });

    it('reader cannot PATCH another user (not their own profile)', async () => {
      const regular = await context.registerAndLogin({ prefix: 'other', name: 'Other User' });

      await request(context.httpServer)
        .patch(`/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${regular.accessToken}`)
        .send({ name: 'Hacked' })
        .expect(403);
    });

    it('reader can PATCH own profile but cannot set accountType', async () => {
      const user = await context.registerAndLogin({ prefix: 'selfpatch', name: 'Self Patch User' });
      await verifyEmail(user.id);
      const tokens = await context.login(user.email);
      const selfPatchUser = { ...user, ...tokens };

      // PATCH own profile (via /users/:id with own id) — accountType should be stripped
      await request(context.httpServer)
        .patch(`/users/${selfPatchUser.id}`)
        .set('Authorization', `Bearer ${selfPatchUser.accessToken}`)
        .send({ accountType: AccountType.ADMIN, name: 'Updated Name' })
        .expect(200);

      const me = await request(context.httpServer)
        .get('/users/me')
        .set('Authorization', `Bearer ${selfPatchUser.accessToken}`)
        .expect(200);

      expect(me.body.accountType).toBe(AccountType.READER);
      expect(me.body.name).toBe('Updated Name');
    });

    it('prevents self-escalation via /users/me', async () => {
      const user = await context.registerAndLogin({ prefix: 'selfescalate', name: 'Self Escalate User' });
      await verifyEmail(user.id);
      const tokens = await context.login(user.email);
      const selfEscalateUser = { ...user, ...tokens };

      // PATCH via /users/me — accountType should be stripped by updateMe
      await request(context.httpServer)
        .patch('/users/me')
        .set('Authorization', `Bearer ${selfEscalateUser.accessToken}`)
        .send({ accountType: AccountType.ADMIN, adminRole: AdminRole.SUPER_ADMIN })
        .expect(200);

      const me = await request(context.httpServer)
        .get('/users/me')
        .set('Authorization', `Bearer ${selfEscalateUser.accessToken}`)
        .expect(200);

      expect(me.body.accountType).toBe(AccountType.READER);
      expect(me.body.adminRole).toBeNull();
    });
  });
});