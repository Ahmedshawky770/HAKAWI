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
    // A SUPER ADMIN, and not a verification officer, because this account has to do
    // two things: create a category, which the taxonomy routes ask a content moderator
    // for, and approve a professional, which the user routes ask a verification officer
    // for. A super admin implies every administrative role, so it is the one account
    // that can do both. The token is minted AFTER the promotion, because the role is in
    // the token and a token minted before it would be refused.
    await context.promoteToAdmin(adminUser.id, AdminRole.SUPER_ADMIN);
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

  /**
   * THE REACTORS, IN ONE STATEMENT.
   *
   * The accounts used to be created one registration at a time — a hundred HTTP
   * registrations, each hashing a password — and then inserted one reaction at a
   * time. That is two hundred round trips, and it took longer than the test's own
   * timeout, so the test failed on how SLOWLY it simulated a threshold rather than on
   * the threshold.
   *
   * The test is about the THRESHOLD, so the accounts are created the way the
   * reactions are inserted: directly, in one statement, in the database the
   * threshold is counted in.
   */
  const simulateReactions = async (userId: string, storyId: string, count: number): Promise<void> => {
    const existing = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM users WHERE id != ${userId}
    `);
    const needed = count - Number(existing.rows[0]?.count ?? '0');

    if (needed > 0) {
      await db.execute(sql`
        INSERT INTO users (id, username, email, name)
        SELECT
          uuid_generate_v4(),
          'rx_' || gs,
          'rx_' || gs || '@hakawi.test',
          'Reactor ' || gs
        FROM generate_series(1, ${needed}) AS gs
      `);
    }

    await db.execute(sql`
      INSERT INTO reactions (story_id, user_id, type, created_at)
      SELECT ${storyId}, id, 'like', now()
      FROM users
      WHERE id != ${userId}
      LIMIT ${count}
    `);
  };

  // Inserts follow rows directly
  const simulateFollowers = async (userId: string, count: number): Promise<void> => {
    // The same reasoning as `simulateReactions`: the accounts are created in one
    // statement, so the test measures the threshold and not the cost of creating a
    // hundred accounts over HTTP.
    const existing = await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count FROM users WHERE id != ${userId}
    `);
    const needed = count - Number(existing.rows[0]?.count ?? '0');

    if (needed > 0) {
      await db.execute(sql`
        INSERT INTO users (id, username, email, name)
        SELECT
          uuid_generate_v4(),
          'fw_' || gs,
          'fw_' || gs || '@hakawi.test',
          'Follower ' || gs
        FROM generate_series(1, ${needed}) AS gs
      `);
    }

    await db.execute(sql`
      INSERT INTO follows (follower_id, following_id, created_at)
      SELECT id, ${userId}, now()
      FROM users
      WHERE id != ${userId}
      LIMIT ${count}
    `);
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

    it('rejects self-upgrade to professional without admin approval', async () => {
      await request(context.httpServer)
        .post('/users/me/upgrade')
        .set('Authorization', `Bearer ${reader.accessToken}`)
        .send({ target: 'professional' })
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