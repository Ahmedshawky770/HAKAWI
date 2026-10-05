import request from 'supertest';

import { AdminRole } from '../src/common/constants/roles.ts';
import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext, TestUser } from '../src/test/helpers/test-context.ts';

/** `notifications.type` is a plain `string`; this is the shape the read route actually returns. */
interface NotificationRow {
  id: string;
  isRead: boolean;
  type: string;
}

const NOTIFICATION_POLL_ATTEMPTS = 60;
const NOTIFICATION_POLL_INTERVAL_MS = 100;
/** An in-flight listener needs this long to finish before an ABSENT row means anything. */
const NOTIFICATION_SETTLE_MS = 1_000;

describe('Notifications Integration', () => {
  let context: TestContext;
  let user: TestUser;
  let follower: TestUser;

  beforeAll(async () => {
    context = await createTestContext();
    user = await context.registerAndLogin({ prefix: 'notified' });

    /**
     * WHY THE CATEGORY IS CREATED BY A SEPARATE ACCOUNT.
     *
     * `POST /categories` is `@Secured(AccountType.ADMIN)` +
     * `@RequireAdminRole(CONTENT_MODERATOR)` + `@RequirePermissions(CONTENT_EDIT_ALL)`, so the
     * ordinary reader who creates the contest cannot create the category the contest points at. The
     * privilege belongs to the fixture step that needs it, not to the user under test: promoting
     * `user` instead would have made every notification below be about an administrator, and
     * `GET /notifications` reads nothing that depends on the account type — so the promotion would
     * have bought nothing and hidden the route's actual requirement.
     */
    const moderator = await context.registerAndLogin({ prefix: 'notifiedmod', name: 'Notifications Moderator' });
    await context.promoteToAdmin(moderator.id, AdminRole.CONTENT_MODERATOR);
    // WHY A SECOND LOGIN: the access token is minted from the `users` row as it stood at login, so
    // the token `registerAndLogin` returned predates the promotion and `RolesGuard` refuses it.
    const moderatorToken = (await context.login(moderator.email)).accessToken;

    const category = await context.createCategory(moderatorToken, { name: 'Notifications Category' });
    const now = Date.now();
    const contestRes = await request(context.httpServer)
      .post('/contests')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Notifications Contest',
        description: 'Creates a contest whose author must NOT be notified',
        categoryId: category.id,
        startDate: new Date(now + 86400000).toISOString(),
        endDate: new Date(now + 7 * 86400000).toISOString(),
        submissionDeadline: new Date(now + 3 * 86400000).toISOString(),
      })
      .expect(201);

    expect(contestRes.body).toHaveProperty('id');

    /**
     * WHY A FOLLOWER IS NEEDED AT ALL.
     *
     * This suite used to get its unread row from the contest creation above, because a duplicate
     * `contest.created` handler in the notifications module wrote one. That handler is gone — the
     * contests module owns contest notifications and has decided in writing that a contest author is
     * told nothing about their own contest — so the row this suite reads, marks and clears now has to
     * come from a path the notifications module actually owns. A follow is the cheapest one, and it
     * exercises the same preference gate and the same `GET /notifications` route.
     */
    follower = await context.registerAndLogin({ prefix: 'notifiedfollower' });
    await request(context.httpServer)
      .post('/follows')
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .send({ followingId: user.id })
      .expect(201);
  });

  afterAll(async () => {
    await context.close();
  });

  const listNotifications = async (): Promise<NotificationRow[]> => {
    const res = await request(context.httpServer)
      .get('/notifications')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    return res.body.notifications as NotificationRow[];
  };

  /**
   * WHY THIS POLLS INSTEAD OF READING ONCE.
   *
   * `FollowsService.follow` fires `user.followed` without awaiting it, `EventValidatorService.emit`
   * hands the payload to `EventEmitter2`, and the emitter dispatches every listener as a detached
   * promise. So `POST /follows` has already answered 201 while the notification row is still being
   * written — a single immediate read is a race that passes on an idle machine and fails on a loaded
   * one, which is the worst shape for a suite that has just been un-skipped. `notifications.
   * phase3.integration-spec.ts` settles for the same reason.
   */
  const waitForNotification = async (type: string): Promise<NotificationRow[]> => {
    for (let attempt = 0; attempt < NOTIFICATION_POLL_ATTEMPTS; attempt += 1) {
      const notifications = await listNotifications();
      if (notifications.some((notification) => notification.type === type)) {
        return notifications;
      }
      await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_POLL_INTERVAL_MS));
    }
    return listNotifications();
  };

  /** The window an in-flight notification needs before its absence means anything. */
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_SETTLE_MS));
  };

  describe('GET /notifications', () => {
    it('should list the notification produced for the recipient', async () => {
      const notifications = await waitForNotification('follow');

      expect(Array.isArray(notifications)).toBe(true);
      expect(notifications.length).toBeGreaterThanOrEqual(1);
      expect(notifications.some((notification) => notification.type === 'follow')).toBe(true);
    });
  });

  /**
   * THE DUPLICATE-HANDLER REGRESSION, OVER HTTP.
   *
   * `contest.created` was answered by two handlers: the contests module, which notifies nobody because
   * "the author is the only party that did not already know", and the notifications module, which wrote
   * the author a "Your contest has been created successfully" row about something they had just done.
   * `winner.selected` and `prize.distributed` were worse — a winner received two rows for winning and two
   * for the prize, the pairs typed differently (`contest`/`payment` and `winner.selected`/
   * `prize.distributed`), so nothing downstream could even tell them apart. The contests module owns all
   * three now; these three strings are the fingerprints of the deleted handlers, and no code writes them
   * any more.
   *
   * A negative case cannot poll for an absence, so it settles first and only then asserts the rows are
   * missing — otherwise the assertion would pass on a machine where the row had not been written yet.
   */
  describe('contest notifications', () => {
    it('should not tell a contest author that their own contest was created', async () => {
      await settle();

      const notifications = await listNotifications();

      expect(notifications.filter((notification) => notification.type === 'contest.created')).toEqual([]);
    });

    it('should never write the notification types the duplicate handlers used', async () => {
      await settle();

      const types = (await listNotifications()).map((notification) => notification.type);

      expect(types).not.toContain('winner.selected');
      expect(types).not.toContain('prize.distributed');
    });
  });

  describe('GET /notifications/unread-count', () => {
    it('should count unread notifications', async () => {
      const res = await request(context.httpServer)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(typeof res.body.count).toBe('number');
      expect(res.body.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PATCH /notifications/:id/read', () => {
    it('should mark a notification as read', async () => {
      const notifications = await listNotifications();
      const unread = notifications.find((notification) => !notification.isRead);
      expect(unread).toBeDefined();

      const res = await request(context.httpServer)
        .patch(`/notifications/${unread?.id ?? ''}/read`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('message');

      const after = await listNotifications();
      const updated = after.find((notification) => notification.id === unread?.id);
      expect(updated?.isRead).toBe(true);
    });
  });

  describe('PATCH /notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const res = await request(context.httpServer)
        .patch('/notifications/read-all')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('message');

      const count = await request(context.httpServer)
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(count.body.count).toBe(0);
    });
  });
});
