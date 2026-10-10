import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';

import { notifications, notificationPreferences } from '../../../db/schema/social.schema.ts';
import { installMockDb, firstArgsOf, type MockChain, type MockDbControl } from '../../../test/helpers/mock-db.ts';

import { NotificationsRepository } from './notifications.repository.ts';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../../db/index.ts', () => ({ db, default: db }));

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  verbose: vi.fn(),
}));

vi.mock('../../../common/services/winston-logger.service.ts', () => ({
  WinstonLoggerService: class {
    info = logger.info;
    log = logger.log;
    error = logger.error;
    warn = logger.warn;
    debug = logger.debug;
    verbose = logger.verbose;
  },
}));

const NOTIFICATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const ALL_CHANNELS_ENABLED = {
  emailEnabled: true,
  pushEnabled: true,
  storyReactions: true,
  comments: true,
  follows: true,
  mentions: true,
  messages: true,
  system: true,
};

describe('NotificationsRepository', () => {
  let repository: NotificationsRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new NotificationsRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the notification when one matches', async () => {
      control.queue([{ id: NOTIFICATION_ID, userId: USER_ID, isRead: false }]);

      await expect(repository.findById(NOTIFICATION_ID)).resolves.toMatchObject({
        id: NOTIFICATION_ID,
        userId: USER_ID,
      });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('narrows the lookup to the requested id and takes a single row', async () => {
      control.queue([]);

      await repository.findById(NOTIFICATION_ID);

      expect(whereOf()).toEqual(eq(notifications.id, NOTIFICATION_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(NOTIFICATION_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(NOTIFICATION_ID)).rejects.toBe(failure);
    });
  });

  describe('findByUser', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: NOTIFICATION_ID }], [{ total: 1 }]);

      await expect(repository.findByUser(USER_ID, 1, 20)).resolves.toEqual({
        notifications: [{ id: NOTIFICATION_ID }],
        total: 1,
      });
    });

    it('returns an empty page for a user with no notifications', async () => {
      control.queue([], [{ total: 0 }]);

      await expect(repository.findByUser(USER_ID, 1, 20)).resolves.toEqual({
        notifications: [],
        total: 0,
      });
    });

    it('filters the page and the count by the same owner', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, 1, 20);

      // A page filtered differently from its count would report a total the page cannot deliver.
      expect(whereOf(0)).toEqual(eq(notifications.userId, USER_ID));
      expect(whereOf(1)).toEqual(eq(notifications.userId, USER_ID));
    });

    it('paginates the first page from offset zero', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('paginates a later page from the requested limit', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, 3, 10);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([20]);
    });

    it('orders newest first and reads from the notifications table', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(notifications.createdAt)]);
      expect(firstArgsOf(chains[0]!, 'from')).toEqual([notifications]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '7' }]);

      await expect(repository.findByUser(USER_ID, 1, 20)).resolves.toMatchObject({ total: 7 });
    });
  });

  describe('findUnread', () => {
    it('returns only the unread notifications, newest first', async () => {
      control.queue([{ id: NOTIFICATION_ID, isRead: false }]);

      await expect(repository.findUnread(USER_ID, 50)).resolves.toEqual([{ id: NOTIFICATION_ID, isRead: false }]);

      expect(whereOf()).toEqual(and(eq(notifications.userId, USER_ID), eq(notifications.isRead, false)));
      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(notifications.createdAt)]);
    });

    it('applies the limit, because this query used to have none at all', async () => {
      // A user with thousands of unread rows downloaded every one of them on every poll, and the
      // route took no query parameters to bound it even if it had. The badge COUNT comes from
      // `countUnread` and is unaffected, so capping the list does not change the count.
      control.queue([]);

      await repository.findUnread(USER_ID, 50);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([50]);
    });

    it('returns an empty list when nothing is unread', async () => {
      control.queue([]);

      await expect(repository.findUnread(USER_ID, 50)).resolves.toEqual([]);
    });
  });

  describe('create', () => {
    it('inserts the payload untouched and returns the inserted notification', async () => {
      // No isRead/readAt in the values: those stay column defaults, so a new row is unread.
      const input = {
        userId: USER_ID,
        type: 'follow',
        title: 'New follower',
        message: 'Someone followed you',
        data: '{"actorId":"abc"}',
      };
      control.queue([{ id: NOTIFICATION_ID, ...input }]);

      const created = await repository.create(input);

      expect(created).toMatchObject({ id: NOTIFICATION_ID });
      expect(db.insert).toHaveBeenCalledWith(notifications);
      expect(firstArgsOf(chains[0]!, 'values')).toEqual([input]);
    });
  });

  describe('markAsRead', () => {
    it('flips the read flag, stamps readAt, and returns the updated row', async () => {
      control.queue([{ id: NOTIFICATION_ID, isRead: true }]);

      const updated = await repository.markAsRead(NOTIFICATION_ID);

      expect(updated).toMatchObject({ isRead: true });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch.isRead).toBe(true);
      expect(patch.readAt).toBeInstanceOf(Date);
    });

    it('narrows the write to the requested notification', async () => {
      control.queue([{ id: NOTIFICATION_ID }]);

      await repository.markAsRead(NOTIFICATION_ID);

      expect(whereOf()).toEqual(eq(notifications.id, NOTIFICATION_ID));
      expect(db.update).toHaveBeenCalledWith(notifications);
    });
  });

  describe('markAllAsRead', () => {
    it('flags every notification of the owner as read', async () => {
      control.queue([]);

      await repository.markAllAsRead(USER_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch.isRead).toBe(true);
      expect(patch.readAt).toBeInstanceOf(Date);
    });

    it('touches only the unread rows, so readAt stays null on the ones already read', async () => {
      control.queue([]);

      await repository.markAllAsRead(USER_ID);

      expect(whereOf()).toEqual(and(eq(notifications.userId, USER_ID), eq(notifications.isRead, false)));
    });
  });

  describe('delete', () => {
    it('removes the row outright instead of flagging it', async () => {
      control.queue([]);

      await repository.delete(NOTIFICATION_ID);

      expect(db.delete).toHaveBeenCalledWith(notifications);
      expect(whereOf()).toEqual(eq(notifications.id, NOTIFICATION_ID));
    });
  });

  describe('countUnread', () => {
    it('counts only the unread notifications of that owner', async () => {
      control.queue([{ total: 4 }]);

      await expect(repository.countUnread(USER_ID)).resolves.toBe(4);

      expect(whereOf()).toEqual(and(eq(notifications.userId, USER_ID), eq(notifications.isRead, false)));
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([{ total: '12' }]);

      await expect(repository.countUnread(USER_ID)).resolves.toBe(12);
    });
  });

  describe('findPreferences', () => {
    it('returns the stored preferences for the owner', async () => {
      const stored = {
        emailEnabled: false,
        pushEnabled: true,
        storyReactions: false,
        comments: true,
        follows: false,
        mentions: true,
        messages: false,
        system: false,
      };
      control.queue([stored]);

      await expect(repository.findPreferences(USER_ID)).resolves.toEqual(stored);
    });

    // The column was added by migration 0023, so the read has to name it: a row stored while messages
    // were muted must come back as `messages: false` rather than as the all-true default, or the
    // preference would silently read as "on" and a direct message could never be suppressed.
    it('returns the stored messages flag rather than defaulting it', async () => {
      control.queue([{ ...ALL_CHANNELS_ENABLED, messages: false }]);

      await expect(repository.findPreferences(USER_ID)).resolves.toMatchObject({ messages: false });
    });

    it('reads a single preferences row keyed by owner', async () => {
      control.queue([]);

      await repository.findPreferences(USER_ID);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([notificationPreferences]);
      expect(whereOf()).toEqual(eq(notificationPreferences.userId, USER_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('falls back to every channel enabled when the owner has no row yet', async () => {
      control.queue([]);

      await expect(repository.findPreferences(USER_ID)).resolves.toEqual(ALL_CHANNELS_ENABLED);
    });
  });

  describe('upsertPreferences', () => {
    const patch = {
      emailEnabled: false,
      pushEnabled: true,
      storyReactions: true,
      comments: false,
      follows: true,
      mentions: true,
      messages: false,
      system: false,
    };

    it('inserts with the owner stamped onto the row', async () => {
      control.queue([patch]);

      await repository.upsertPreferences(USER_ID, patch);

      expect(db.insert).toHaveBeenCalledWith(notificationPreferences);
      expect(firstArgsOf(chains[0]!, 'values')).toEqual([{ userId: USER_ID, ...patch }]);
    });

    it('conflicts on the owner column so a second save updates in place', async () => {
      // The conflict target has to be a unique index on user_id, otherwise Postgres rejects the
      // statement outright instead of updating.
      control.queue([patch]);

      await repository.upsertPreferences(USER_ID, patch);

      const [conflict] = firstArgsOf(chains[0]!, 'onConflictDoUpdate') as [
        { target: unknown; set: Record<string, unknown> },
      ];
      expect(conflict.target).toBe(notificationPreferences.userId);
      expect(conflict.set).toMatchObject(patch);
      expect(conflict.set.updatedAt).toBeInstanceOf(Date);
    });

    it('returns the saved preferences rather than the submitted patch', async () => {
      control.queue([{ ...patch, pushEnabled: false }]);

      await expect(repository.upsertPreferences(USER_ID, patch)).resolves.toEqual({
        ...patch,
        pushEnabled: false,
      });
    });
  });
});
