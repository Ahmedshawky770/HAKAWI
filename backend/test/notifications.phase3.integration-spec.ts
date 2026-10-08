import request from 'supertest';

import { createTestContext } from '../src/test/helpers/test-context.ts';
import type { TestContext, TestUser } from '../src/test/helpers/test-context.ts';
import type { NotificationsListResponse, CreatedResource } from '../src/test/helpers/test-response-types.ts';

/**
 * THE PHASE-3 NOTIFICATION WRITE PATH, END TO END, OVER HTTP.
 *
 * WHY THIS FILE HAD TO BE WRITTEN. The path is real and traced:
 *
 *   follow        `FollowsService.follow`            → `user.followed`     ┐
 *   story react   `ReactionsService.addReaction`     → `story.reacted`    │
 *   comment       `CommentsService.create`           → `comment.created`  ├→ `NotificationsEventHandler`
 *   comment react `CommentReactionsService.addReaction` → `comment.reacted`│
 *   message       `MessagesService.sendMessage`      → `message.sent`     ┘
 *                                                                              ↓
 *                                          `NotificationsService.create`  (preference gate)
 *                                                                              ↓
 *                              `NotificationsRepository.create` → the `notifications` row
 *
 * …and no test asserted any of it. `backend/test/notifications.integration-spec.ts` drove
 * `contest.created`, which is not a path through this handler at all — contest notifications belong to
 * the contests module alone — so the roadmap's "notification write path ✅" was a claim about code that
 * existed, with zero evidence that a row was ever written.
 *
 * Each case is asserted in BOTH directions, which is the whole point: a row appearing proves the write
 * works, and NO row appearing after the preference is switched off proves the gate is what stopped it
 * rather than the trigger simply not firing. A direct message was the one case that could not be paired
 * until migration 0023 gave it a `messages` column to switch off; it is paired like the rest now.
 *
 * WHY EVERY ASSERTION POLLS OR SETTLES. `EventValidatorService.emit` awaits the emitter, and the
 * emitter dispatches listeners as detached promises — so the follow / reaction / comment has already
 * returned 201 while its notification is still in flight. Reading immediately would be a race that
 * passes locally and fails on a loaded machine. Negative cases cannot poll for an absence, so they wait
 * a fixed settle period first and only then assert the row is missing.
 */

interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  isRead: boolean;
}

type PreferenceKey = 'follows' | 'storyReactions' | 'comments' | 'messages';

interface Phase3Case {
  /** Readable name for the trigger, used in the `describe` block. */
  readonly label: string;
  /** The `notifications.type` the recipient must receive. */
  readonly expectedType: string;
  /** The preference family that must gate it, or `null` when no column governs the type. */
  readonly preference: PreferenceKey | null;
  readonly act: (participants: Participants) => Promise<void>;
}

interface Participants {
  readonly context: TestContext;
  readonly recipient: TestUser;
  readonly actor: TestUser;
}

/** `notifications.type` is a plain `string`; the shape below is what the read route returns. */
type CreatedResourceType = { id: string };

const POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 100;
const SETTLE_MS = 1_000;

const CASES: readonly Phase3Case[] = [
  {
    label: 'following a user',
    expectedType: 'follow',
    preference: 'follows',
    async act({ context, recipient, actor }) {
      await request(context.httpServer)
        .post('/follows')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ followingId: recipient.id })
        .expect(201);
    },
  },
  {
    label: 'reacting to a story',
    expectedType: 'story_reaction',
    preference: 'storyReactions',
    async act({ context, recipient, actor }) {
      const story = await context.createStory(recipient.accessToken, { title: 'Reaction target story' });

      await request(context.httpServer)
        .post(`/reactions/stories/${story.id}`)
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ type: 'love' })
        .expect(201);
    },
  },
  {
    label: 'commenting on a story',
    expectedType: 'comment',
    preference: 'comments',
    async act({ context, recipient, actor }) {
      const story = await context.createStory(recipient.accessToken, { title: 'Commented-on story' });

      await request(context.httpServer)
        .post('/comments')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ storyId: story.id, content: 'This deserves a reaction' })
        .expect(201);
    },
  },
{
      // The C3 case, over HTTP: this row used to be written as `story_reaction`, which resolved to the
      // `storyReactions` preference — so muting comments did not silence it and muting story reactions
      // did not either. Both halves are asserted below.
      label: 'reacting to a comment',
      expectedType: 'comment_reaction',
      preference: 'comments',
      async act({ context, recipient, actor }) {
        const story = await context.createStory(recipient.accessToken, { title: 'Comment-reacted story' });
        const comment = await request(context.httpServer)
          .post('/comments')
          .set('Authorization', `Bearer ${recipient.accessToken}`)
          .send({ storyId: story.id, content: 'A comment of my own' })
          .expect(201);

        const commentBody = comment.body as CreatedResourceType;

        await request(context.httpServer)
          .post(`/comments/${commentBody.id}/reactions`)
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .send({ type: 'like' })
          .expect(201);
      },
    },
    {
      label: 'sending a direct message',
      expectedType: 'message',
      // Migration 0023 added the `messages` column and `PREFERENCE_FOR_TYPE` maps `message` onto it, so
      // the negative half of this pair now exists. It could not before: with no entry in the map and no
      // column behind it, a recipient had no switch at all for a direct message — the one notification in
      // the product that could not be silenced. The `describe` below pins that the switch is offered.
      preference: 'messages',
      async act({ context, recipient, actor }) {
        const conversation = await request(context.httpServer)
          .post('/messages/conversations')
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .send({ recipientId: recipient.id })
          .expect(201);

        const conversationBody = conversation.body as CreatedResourceType;

        await request(context.httpServer)
          .post(`/messages/conversations/${conversationBody.id}/messages`)
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .send({ content: 'A direct message' })
          .expect(201);
      },
    },
  ];

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('Phase 3 Notification Write Path', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  const notificationsOf = async (user: TestUser): Promise<NotificationRow[]> => {
    const response = await request(context.httpServer)
      .get('/notifications')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    const body = response.body as NotificationsListResponse;
    return body.notifications as NotificationRow[];
  };

  const awaitNotification = async (user: TestUser, type: string): Promise<NotificationRow> => {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      const found = (await notificationsOf(user)).find((row) => row.type === type);
      if (found) {
        return found;
      }
      await delay(POLL_INTERVAL_MS);
    }
    throw new Error(`No "${type}" notification reached user ${user.id} within ${POLL_ATTEMPTS} polls`);
  };

  const setPreference = async (user: TestUser, key: PreferenceKey, value: boolean): Promise<void> => {
    await request(context.httpServer)
      .patch('/notifications/preferences')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ [key]: value })
      .expect(200);
  };

  const readPreferences = async (user: TestUser): Promise<Record<string, boolean>> => {
    const response = await request(context.httpServer)
      .get('/notifications/preferences')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    return response.body as Record<string, boolean>;
  };

  /** A recipient who never acted, so every notification they hold came from the case's trigger. */
  const participants = async (): Promise<Participants> => ({
    context,
    recipient: await context.registerAndLogin({ prefix: 'recipient' }),
    actor: await context.registerAndLogin({ prefix: 'actor' }),
  });

  for (const testCase of CASES) {
    describe(testCase.label, () => {
      it(`should write a "${testCase.expectedType}" notification row for the recipient`, async () => {
        const { recipient, actor } = await participants();

        await testCase.act({ context, recipient, actor });

        const row = await awaitNotification(recipient, testCase.expectedType);
        expect(row.userId).toBe(recipient.id);
        expect(row.isRead).toBe(false);
      });
    });
  }

  // Every case whose type a preference column governs — which is all of them, now that `message` has a
  // column of its own behind migration 0023.
  for (const testCase of CASES.filter((entry) => entry.preference !== null)) {
    const preference: PreferenceKey = testCase.preference as PreferenceKey;

    describe(`when the recipient has disabled ${preference} — ${testCase.label}`, () => {
      it(`should not write a "${testCase.expectedType}" notification row`, async () => {
        const { recipient, actor } = await participants();
        await setPreference(recipient, preference, false);
        // The preference has to have been STORED, or the absence below would prove nothing about the
        // gate — it could just be a PATCH that silently did nothing.
        expect((await readPreferences(recipient))[preference]).toBe(false);

        await testCase.act({ context, recipient, actor });
        await delay(SETTLE_MS);

        expect((await notificationsOf(recipient)).filter((row) => row.type === testCase.expectedType)).toEqual([]);
      });
    });
  }

  // The other half of the C3 defect, over HTTP: a recipient who turned STORY reactions off must still
  // be told about a reaction to their COMMENT, because those are governed by different families.
  describe('when the recipient has disabled storyReactions but not comments', () => {
    it('should still write a comment_reaction notification row', async () => {
      const { recipient, actor } = await participants();
      await setPreference(recipient, 'storyReactions', false);
      const story = await context.createStory(recipient.accessToken, { title: 'Mixed-preference story' });
      const comment = await request(context.httpServer)
        .post('/comments')
        .set('Authorization', `Bearer ${recipient.accessToken}`)
        .send({ storyId: story.id, content: 'Reacted despite a muted story preference' })
        .expect(201);

      const commentBody = comment.body as CreatedResourceType;

      await request(context.httpServer)
        .post(`/comments/${commentBody.id}/reactions`)
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ type: 'wow' })
        .expect(201);

      const row = await awaitNotification(recipient, 'comment_reaction');
      expect(row.userId).toBe(recipient.id);
    });
  });

  // The whole key set, asserted rather than spot-checked. This case used to pin the ABSENCE of a
  // `messages` family — "a direct message cannot be muted at all" — and it failed loudly the moment
  // migration 0023 added the column, which is exactly what it was written to do: a capability cannot
  // arrive without saying so. It now pins the surface the API offers, so the next family has to be added
  // here too rather than slipping in unnoticed.
  describe('the notification preference surface', () => {
    it('offers a messages preference alongside the other families', async () => {
      const user = await context.registerAndLogin({ prefix: 'prefreader' });

      expect(Object.keys(await readPreferences(user)).sort()).toEqual([
        'comments',
        'emailEnabled',
        'follows',
        'mentions',
        'messages',
        'pushEnabled',
        'storyReactions',
        'system',
      ]);
    });

    // Every family's default is on, including the new one: the column defaults to `true` so that nobody
    // who had already configured preferences silently loses notifications on deploy.
    it('defaults messages to on for a user who has never touched their preferences', async () => {
      const user = await context.registerAndLogin({ prefix: 'prefdefault' });

      expect((await readPreferences(user)).messages).toBe(true);
    });
  });
});
