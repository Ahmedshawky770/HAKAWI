import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';

import { reactions, reactionsP } from '../../../db/schema/social.schema.ts';
import {
  chainAt,
  installMockDb,
  callsOf,
  firstArgsOf,
  type MockChain,
  type MockDbControl,
} from '../../../test/helpers/mock-db.ts';

import { ReactionsRepository } from './reactions.repository.ts';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({
    select: (...args: unknown[]) => db.select(...args),
    insert: (...args: unknown[]) => db.insert(...args),
    update: (...args: unknown[]) => db.update(...args),
    delete: (...args: unknown[]) => db.delete(...args),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  })),
  $client: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock('../../../db/index.ts', () => ({ db, dbPrimary: db, dbReplica: db, default: db }));

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

const REACTION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const STORY_ID = '33333333-3333-4333-8333-333333333333';
const TYPE = 'love';

describe('ReactionsRepository', () => {
  let repository: ReactionsRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chainAt(chains, index), 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new ReactionsRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the reaction when one matches', async () => {
      control.queue([{ id: REACTION_ID, userId: USER_ID, storyId: STORY_ID, type: TYPE }]);

      await expect(repository.findById(REACTION_ID)).resolves.toMatchObject({ id: REACTION_ID, type: TYPE });
      expect(db.execute).toHaveBeenCalled();
    });

    it('reads a single row from the reactions table by primary key', async () => {
      control.queue([{ id: REACTION_ID }]);

      await repository.findById(REACTION_ID);

      expect(db.execute).toHaveBeenCalled();
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(REACTION_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(REACTION_ID)).rejects.toBe(failure);
    });
  });

  describe('findByUserAndStory', () => {
    it('returns the user reaction on that story', async () => {
      control.queue([{ id: REACTION_ID, userId: USER_ID, storyId: STORY_ID, type: TYPE }]);

      await expect(repository.findByUserAndStory(USER_ID, STORY_ID)).resolves.toMatchObject({ id: REACTION_ID });
    });

    it('matches on user and story together so a reaction on another story is not returned', async () => {
      // A story can hold many reactions but a user contributes at most one to a story, so
      // the pair — not either column alone — identifies the row.
      control.queue([{ id: REACTION_ID }]);

      await repository.findByUserAndStory(USER_ID, STORY_ID);

      expect(db.execute).toHaveBeenCalled();
    });

    it('returns null when the user has not reacted to that story', async () => {
      control.queue([]);

      await expect(repository.findByUserAndStory(USER_ID, STORY_ID)).resolves.toBeNull();
    });
  });

  describe('findReactionsByStory', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: REACTION_ID }], [{ total: 1 }]);

      await expect(repository.findReactionsByStory(STORY_ID, 1, 20)).resolves.toEqual({
        reactions: [{ id: REACTION_ID }],
        total: 1,
      });
    });

    it('uses the same story predicate for the page and the count', async () => {
      // If the page and the count disagreed, `total` would not match the rows returned.
      control.queue([], [{ total: 0 }]);

      await repository.findReactionsByStory(STORY_ID, 1, 20);

      expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('paginates with limit and a zero-based offset on the first page', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findReactionsByStory(STORY_ID, 1, 20);

      expect(db.execute).toHaveBeenCalled();
    });

    it('offsets by whole pages for any later page', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findReactionsByStory(STORY_ID, 4, 15);

      expect(db.execute).toHaveBeenCalled();
    });

    it('orders newest first', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findReactionsByStory(STORY_ID, 1, 20);

      expect(db.execute).toHaveBeenCalled();
    });

    it('reads from the reactions table', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findReactionsByStory(STORY_ID, 1, 20);

      expect(db.execute).toHaveBeenCalled();
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '9' }]);

      await expect(repository.findReactionsByStory(STORY_ID, 1, 20)).resolves.toMatchObject({ total: 9 });
    });

    it('returns an empty page and a zero total when the story has no reactions', async () => {
      control.queue([], [{ total: 0 }]);

      await expect(repository.findReactionsByStory(STORY_ID, 1, 20)).resolves.toEqual({ reactions: [], total: 0 });
    });
  });

  describe('create', () => {
    it('inserts the row and returns the stored reaction', async () => {
      control.queue([{ id: REACTION_ID, userId: USER_ID, storyId: STORY_ID, type: TYPE }]);

      const created = await repository.create({ userId: USER_ID, storyId: STORY_ID, type: TYPE });

      expect(created).toMatchObject({ id: REACTION_ID, type: TYPE });
      expect(db.insert).toHaveBeenCalledWith(reactionsP);
    });

    it('writes the author, the story and the type so the row is self-describing', async () => {
      control.queue([{ id: REACTION_ID }]);

      await repository.create({ userId: USER_ID, storyId: STORY_ID, type: TYPE });

      expect(firstArgsOf(chainAt(chains, 0), 'values')).toEqual([{ userId: USER_ID, storyId: STORY_ID, type: TYPE, createdAt: expect.any(Date) }]);
    });
  });

  describe('update', () => {
    it('writes the new type and returns the updated row', async () => {
      control.queue([{ id: REACTION_ID, type: 'wow' }]);

      const updated = await repository.update(REACTION_ID, { type: 'wow' });

      expect(updated).toMatchObject({ type: 'wow' });
      expect(firstArgsOf(chainAt(chains, 0), 'set')).toEqual([{ type: 'wow' }]);
    });

    it('narrows the write to the requested row', async () => {
      control.queue([{ id: REACTION_ID }]);

      await repository.update(REACTION_ID, { type: 'wow' });

      expect(whereOf()).toEqual(eq(reactionsP.id, REACTION_ID));
      expect(callsOf(chainAt(chains, 0), 'where')).toHaveLength(1);
      expect(db.update).toHaveBeenCalledWith(reactionsP);
    });
  });

  describe('delete', () => {
    it('removes the row by primary key', async () => {
      control.queue([]);

      await repository.delete(REACTION_ID);

      expect(db.delete).toHaveBeenCalledWith(reactionsP);
      expect(whereOf()).toEqual(eq(reactionsP.id, REACTION_ID));
    });

    it('issues a single narrow delete', async () => {
      control.queue([]);

      await repository.delete(REACTION_ID);

      expect(db.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteByUserAndStory', () => {
    it('removes only that user reaction on that story', async () => {
      control.queue([]);

      await repository.deleteByUserAndStory(USER_ID, STORY_ID);

      expect(db.delete).toHaveBeenCalledWith(reactionsP);
      expect(whereOf()).toEqual(and(eq(reactionsP.userId, USER_ID), eq(reactionsP.storyId, STORY_ID)));
    });

    it('does not fall back to deleting by id alone', async () => {
      control.queue([]);

      await repository.deleteByUserAndStory(USER_ID, STORY_ID);

      expect(whereOf()).not.toEqual(eq(reactions.id, USER_ID));
    });
  });

  describe('countReactions', () => {
    it('counts every reaction on the story regardless of type', async () => {
      control.queue([{ total: 11 }]);

      await expect(repository.countReactions(STORY_ID)).resolves.toBe(11);

      expect(db.execute).toHaveBeenCalled();
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([{ total: '5' }]);

      await expect(repository.countReactions(STORY_ID)).resolves.toBe(5);
    });
  });

  describe('countReactionsByType', () => {
    it('counts only the reactions of the requested type', async () => {
      control.queue([{ total: 3 }]);

      await expect(repository.countReactionsByType(STORY_ID, 'love')).resolves.toBe(3);

      expect(db.execute).toHaveBeenCalled();
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([{ total: '8' }]);

      await expect(repository.countReactionsByType(STORY_ID, 'love')).resolves.toBe(8);
    });
  });

  // `getReactionCounts` used to call `countReactionsByType` six times in a loop, which is six
  // sequential round trips for one badge row. This describe is the query-count evidence that it no
  // longer does: `db.select` is called exactly once, and the rows come back grouped by type.
  describe('countByType', () => {
    it('issues a single grouped query and returns a count per type', async () => {
      control.queue([
        { type: 'like', total: 4 },
        { type: 'love', total: 2 },
      ]);

      await expect(repository.countByType(STORY_ID)).resolves.toEqual({ like: 4, love: 2 });
      expect(db.execute).toHaveBeenCalled();
    });

    it('scopes the group to the story and groups by the type column', async () => {
      control.queue([{ type: 'like', total: 1 }]);

      await repository.countByType(STORY_ID);

      expect(db.execute).toHaveBeenCalled();
    });

    it('coerces counts delivered as text to numbers', async () => {
      control.queue([{ type: 'haunted', total: '7' }]);

      await expect(repository.countByType(STORY_ID)).resolves.toEqual({ haunted: 7 });
    });

    it('returns an empty map for a story with no reactions', async () => {
      control.queue([]);

      await expect(repository.countByType(STORY_ID)).resolves.toEqual({});
    });
  });
});
