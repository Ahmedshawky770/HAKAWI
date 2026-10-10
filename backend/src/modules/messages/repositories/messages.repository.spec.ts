import { describe, it, expect, beforeEach, vi } from 'vitest';
import { desc, eq, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { messages } from '../../../db/schema/social.schema.ts';
import { installMockDb, firstArgsOf, type MockChain, type MockDbControl } from '../../../test/helpers/mock-db.ts';

import { MessagesRepository } from './messages.repository.ts';

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

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const SENDER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_CONVERSATION_ID = '66666666-6666-4666-8666-666666666666';

const dialect = new PgDialect();

describe('MessagesRepository', () => {
  let repository: MessagesRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  /**
   * The statement Postgres would receive for the nth `where` clause.
   *
   * `markAllAsRead` and `countUnread` also constrain the sender, and the service hands both the
   * requesting user, so the direction of that clause is an open question rather than a settled
   * contract. Rendering the clause lets a test pin the scoping that is not in doubt — the
   * conversation, the unread flag, the bound values — without locking the direction in.
   */
  const sqlOf = (index = 0): { sql: string; params: unknown[] } => dialect.sqlToQuery(whereOf(index) as SQL);

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new MessagesRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the message when one matches', async () => {
      control.queue([{ id: MESSAGE_ID, conversationId: CONVERSATION_ID, content: 'hi' }]);

      await expect(repository.findById(MESSAGE_ID)).resolves.toMatchObject({ id: MESSAGE_ID });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('narrows the lookup to the requested id and takes a single row', async () => {
      control.queue([]);

      await repository.findById(MESSAGE_ID);

      expect(whereOf()).toEqual(eq(messages.id, MESSAGE_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(MESSAGE_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(MESSAGE_ID)).rejects.toBe(failure);
    });
  });

  describe('findByConversation', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: MESSAGE_ID }], [{ total: 1 }]);

      await expect(repository.findByConversation(CONVERSATION_ID, 1, 20)).resolves.toEqual({
        messages: [{ id: MESSAGE_ID }],
        total: 1,
      });
    });

    it('returns an empty page for a conversation with no messages', async () => {
      control.queue([], [{ total: 0 }]);

      await expect(repository.findByConversation(CONVERSATION_ID, 1, 20)).resolves.toEqual({ messages: [], total: 0 });
    });

    it('uses one shared conversation predicate for the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByConversation(CONVERSATION_ID, 1, 20);

      // A page filtered differently from its count would report a total the page cannot deliver.
      expect(whereOf(0)).toEqual(eq(messages.conversationId, CONVERSATION_ID));
      expect(whereOf(1)).toEqual(eq(messages.conversationId, CONVERSATION_ID));
    });

    it('paginates the first page from offset zero', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByConversation(CONVERSATION_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('paginates a later page from the requested limit', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByConversation(CONVERSATION_ID, 4, 25);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([25]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([75]);
    });

    it('orders newest first and reads from the messages table', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByConversation(CONVERSATION_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(messages.createdAt)]);
      expect(firstArgsOf(chains[0]!, 'from')).toEqual([messages]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '7' }]);

      await expect(repository.findByConversation(CONVERSATION_ID, 1, 20)).resolves.toMatchObject({ total: 7 });
    });
  });

  describe('create', () => {
    it('inserts the payload untouched and returns the stored message', async () => {
      const input = { conversationId: CONVERSATION_ID, senderId: SENDER_ID, content: 'hello' };
      control.queue([{ id: MESSAGE_ID, ...input, isRead: false }]);

      const created = await repository.create(input);

      expect(created).toMatchObject({ id: MESSAGE_ID });
      expect(db.insert).toHaveBeenCalledWith(messages);
      expect(firstArgsOf(chains[0]!, 'values')).toEqual([input]);
    });
  });

  describe('markAsRead', () => {
    it('flips the read flag, stamps readAt, and returns the updated row', async () => {
      control.queue([{ id: MESSAGE_ID, isRead: true }]);

      const updated = await repository.markAsRead(MESSAGE_ID);

      expect(updated).toMatchObject({ isRead: true });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch.isRead).toBe(true);
      expect(patch.readAt).toBeInstanceOf(Date);
    });

    it('narrows the write to the requested message', async () => {
      control.queue([{ id: MESSAGE_ID }]);

      await repository.markAsRead(MESSAGE_ID);

      expect(whereOf()).toEqual(eq(messages.id, MESSAGE_ID));
      expect(db.update).toHaveBeenCalledWith(messages);
    });
  });

  describe('markAllAsRead', () => {
    it('flags the rows as read and stamps readAt', async () => {
      control.queue([]);

      await repository.markAllAsRead(CONVERSATION_ID, SENDER_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch.isRead).toBe(true);
      expect(patch.readAt).toBeInstanceOf(Date);
    });

    it('touches only the unread rows of that one conversation', async () => {
      control.queue([]);

      await repository.markAllAsRead(CONVERSATION_ID, SENDER_ID);

      const { sql, params } = sqlOf();
      expect(sql).toContain('"messages"."conversation_id"');
      expect(sql).toContain('"messages"."is_read"');
      expect(params).toEqual([CONVERSATION_ID, SENDER_ID, false]);
      expect(db.update).toHaveBeenCalledWith(messages);
    });
  });

  describe('countUnread', () => {
    it('counts the unread rows of that one conversation', async () => {
      control.queue([{ total: 4 }]);

      await expect(repository.countUnread(CONVERSATION_ID, SENDER_ID)).resolves.toBe(4);

      const { sql, params } = sqlOf();
      expect(sql).toContain('"messages"."conversation_id"');
      expect(sql).toContain('"messages"."is_read"');
      expect(params).toEqual([CONVERSATION_ID, SENDER_ID, false]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([{ total: '12' }]);

      await expect(repository.countUnread(CONVERSATION_ID, SENDER_ID)).resolves.toBe(12);
    });
  });

  describe('findLastByConversations', () => {
    it('keys the newest message of every requested conversation', async () => {
      const other = '55555555-5555-4555-8555-555555555555';
      control.queue([
        { id: MESSAGE_ID, conversationId: CONVERSATION_ID, content: 'newest' },
        { id: other, conversationId: OTHER_CONVERSATION_ID, content: 'other newest' },
      ]);

      const result = await repository.findLastByConversations([CONVERSATION_ID, OTHER_CONVERSATION_ID]);

      expect(result.get(CONVERSATION_ID)).toMatchObject({ content: 'newest' });
      expect(result.get(OTHER_CONVERSATION_ID)).toMatchObject({ content: 'other newest' });
    });

    it('sends the whole page in one statement rather than one per conversation', async () => {
      control.queue([]);

      await repository.findLastByConversations([CONVERSATION_ID, OTHER_CONVERSATION_ID]);

      expect(db.select).toHaveBeenCalledTimes(1);
      const { sql, params } = sqlOf();
      expect(sql).toContain('"messages"."conversation_id"');
      expect(params).toEqual([CONVERSATION_ID, OTHER_CONVERSATION_ID]);
    });

    it('picks the newest row per conversation with a correlated lookup on the primary key', async () => {
      control.queue([]);

      await repository.findLastByConversations([CONVERSATION_ID]);

      const { sql, params } = sqlOf();
      // Drizzle's PgSelect has no DISTINCT ON, so the newest row is selected by
      // `id = (select ... order by created_at desc, id desc limit 1)`. The `id` tiebreak is
      // what keeps two messages in the same millisecond from both matching.
      expect(sql).toContain('order by "latest"."created_at" desc, "latest"."id" desc');
      expect(sql).toContain('limit 1');
      expect(params).toEqual([CONVERSATION_ID]);
    });

    it('omits a conversation that has no messages instead of inventing one', async () => {
      control.queue([{ id: MESSAGE_ID, conversationId: CONVERSATION_ID, content: 'newest' }]);

      const result = await repository.findLastByConversations([CONVERSATION_ID, OTHER_CONVERSATION_ID]);

      expect(result.has(OTHER_CONVERSATION_ID)).toBe(false);
      expect(result.size).toBe(1);
    });

    it('issues no query for an empty page', async () => {
      await expect(repository.findLastByConversations([])).resolves.toEqual(new Map());

      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('countIncomingUnreadByConversations', () => {
    it('keys the unread count of every conversation that has one', async () => {
      control.queue([
        { conversationId: CONVERSATION_ID, total: 3 },
        { conversationId: OTHER_CONVERSATION_ID, total: 1 },
      ]);

      const result = await repository.countIncomingUnreadByConversations(
        [CONVERSATION_ID, OTHER_CONVERSATION_ID],
        [OTHER_USER_ID],
      );

      expect(result.get(CONVERSATION_ID)).toBe(3);
      expect(result.get(OTHER_CONVERSATION_ID)).toBe(1);
    });

    it('counts only unread rows sent by the other participants, grouped per conversation', async () => {
      control.queue([{ conversationId: CONVERSATION_ID, total: 3 }]);

      await repository.countIncomingUnreadByConversations([CONVERSATION_ID, OTHER_CONVERSATION_ID], [OTHER_USER_ID]);

      expect(db.select).toHaveBeenCalledTimes(1);
      const { sql, params } = sqlOf();
      expect(sql).toContain('"messages"."conversation_id"');
      expect(sql).toContain('"messages"."sender_id"');
      expect(sql).toContain('"messages"."is_read"');
      expect(firstArgsOf(chains[0]!, 'groupBy')).toEqual([messages.conversationId]);
      expect(params).toEqual([CONVERSATION_ID, OTHER_CONVERSATION_ID, OTHER_USER_ID, false]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([{ conversationId: CONVERSATION_ID, total: '9' }]);

      const result = await repository.countIncomingUnreadByConversations([CONVERSATION_ID], [OTHER_USER_ID]);

      expect(result.get(CONVERSATION_ID)).toBe(9);
    });

    it('issues no query when there is nothing to count', async () => {
      await expect(repository.countIncomingUnreadByConversations([], [OTHER_USER_ID])).resolves.toEqual(new Map());
      await expect(repository.countIncomingUnreadByConversations([CONVERSATION_ID], [])).resolves.toEqual(new Map());

      expect(db.select).not.toHaveBeenCalled();
    });
  });
});
