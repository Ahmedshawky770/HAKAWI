import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, desc, eq, inArray, or } from 'drizzle-orm';

import { conversations } from '../../../db/schema/social.schema.ts';
import { users } from '../../../db/schema/users.schema.ts';
import { installMockDb, firstArgsOf, type MockChain, type MockDbControl } from '../../../test/helpers/mock-db.ts';

import { ConversationsRepository } from './conversations.repository.ts';

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
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333';

describe('ConversationsRepository', () => {
  let repository: ConversationsRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new ConversationsRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the conversation when one matches', async () => {
      control.queue([{ id: CONVERSATION_ID, participant1Id: USER_ID, participant2Id: OTHER_USER_ID }]);

      await expect(repository.findById(CONVERSATION_ID)).resolves.toMatchObject({ id: CONVERSATION_ID });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('narrows the lookup to the requested id and takes a single row', async () => {
      control.queue([]);

      await repository.findById(CONVERSATION_ID);

      expect(whereOf()).toEqual(eq(conversations.id, CONVERSATION_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(CONVERSATION_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(CONVERSATION_ID)).rejects.toBe(failure);
    });
  });

  describe('findByParticipants', () => {
    it('returns the conversation when one matches', async () => {
      control.queue([{ id: CONVERSATION_ID }]);

      await expect(repository.findByParticipants(USER_ID, OTHER_USER_ID)).resolves.toMatchObject({
        id: CONVERSATION_ID,
      });
    });

    it('requires both participants, not just the first one', async () => {
      // A one-sided predicate would hand back a conversation the caller is not part of.
      control.queue([]);

      await repository.findByParticipants(USER_ID, OTHER_USER_ID);

      expect(whereOf()).toEqual(
        and(eq(conversations.participant1Id, USER_ID), eq(conversations.participant2Id, OTHER_USER_ID)),
      );
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the pair has no conversation yet', async () => {
      control.queue([]);

      await expect(repository.findByParticipants(USER_ID, OTHER_USER_ID)).resolves.toBeNull();
    });
  });

  describe('findByUser', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: CONVERSATION_ID }], [{ total: 1 }]);

      await expect(repository.findByUser(USER_ID, 1, 20)).resolves.toEqual({
        conversations: [{ id: CONVERSATION_ID }],
        total: 1,
      });
    });

    it('returns an empty page for a user with no conversations', async () => {
      control.queue([], [{ total: 0 }]);

      await expect(repository.findByUser(USER_ID, 1, 20)).resolves.toEqual({ conversations: [], total: 0 });
    });

    it('scopes the page and the count to both participant columns', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, 1, 20);

      // `or` covers a user stored as participant1 in one row and as participant2 in the next;
      // a page filtered differently from its count would report a total the page cannot deliver.
      const membership = or(eq(conversations.participant1Id, USER_ID), eq(conversations.participant2Id, USER_ID));
      expect(whereOf(0)).toEqual(membership);
      expect(whereOf(1)).toEqual(membership);
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

    it('orders the most recently active conversation first', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByUser(USER_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(conversations.lastMessageAt)]);
      expect(firstArgsOf(chains[0]!, 'from')).toEqual([conversations]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '7' }]);

      await expect(repository.findByUser(USER_ID, 1, 20)).resolves.toMatchObject({ total: 7 });
    });
  });

  describe('create', () => {
    it('inserts the pair and returns the stored conversation', async () => {
      control.queue([{ id: CONVERSATION_ID, participant1Id: USER_ID, participant2Id: OTHER_USER_ID }]);

      const created = await repository.create({ participant1Id: USER_ID, participant2Id: OTHER_USER_ID });

      expect(created).toMatchObject({ id: CONVERSATION_ID });
      expect(db.insert).toHaveBeenCalledWith(conversations);
      expect(firstArgsOf(chains[0]!, 'values')).toEqual([{ participant1Id: USER_ID, participant2Id: OTHER_USER_ID }]);
    });
  });

  describe('updateLastMessage', () => {
    it('stamps a fresh lastMessageAt on the requested conversation only', async () => {
      control.queue([]);

      await repository.updateLastMessage(CONVERSATION_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch.lastMessageAt).toBeInstanceOf(Date);
      expect(whereOf()).toEqual(eq(conversations.id, CONVERSATION_ID));
      expect(db.update).toHaveBeenCalledWith(conversations);
    });
  });

  describe('findParticipantsByIds', () => {
    it('returns the name of every requested participant', async () => {
      control.queue([{ id: USER_ID, name: 'Nour' }]);

      await expect(repository.findParticipantsByIds([USER_ID, OTHER_USER_ID])).resolves.toEqual([
        { id: USER_ID, name: 'Nour' },
      ]);
    });

    it('reads the id and the name from the users table, keyed by the requested ids', async () => {
      control.queue([]);

      await repository.findParticipantsByIds([USER_ID, OTHER_USER_ID]);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([users]);
      expect(whereOf()).toEqual(inArray(users.id, [USER_ID, OTHER_USER_ID]));
    });

    it('short-circuits an empty id list instead of issuing `in ()`', async () => {
      await expect(repository.findParticipantsByIds([])).resolves.toEqual([]);

      expect(db.select).not.toHaveBeenCalled();
    });

    it('returns an empty list when none of the ids resolve', async () => {
      control.queue([]);

      await expect(repository.findParticipantsByIds([USER_ID])).resolves.toEqual([]);
    });
  });
});
