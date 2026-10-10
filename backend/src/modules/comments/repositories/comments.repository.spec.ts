import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { comments } from '../../../db/schema/social.schema.ts';
import {
  installMockDb,
  callsOf,
  firstArgsOf,
  type MockChain,
  type MockDbControl,
} from '../../../test/helpers/mock-db.ts';

import { CommentsRepository } from './comments.repository.ts';

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

const STORY_ID = '11111111-1111-4111-8111-111111111111';
const COMMENT_ID = '22222222-2222-4222-8222-222222222222';
const PARENT_ID = '33333333-3333-4333-8333-333333333333';
const AUTHOR_ID = '44444444-4444-4444-8444-444444444444';

describe('CommentsRepository', () => {
  let repository: CommentsRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new CommentsRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the comment when one matches', async () => {
      control.queue([{ id: COMMENT_ID, storyId: STORY_ID, content: 'hi' }]);

      await expect(repository.findById(COMMENT_ID)).resolves.toMatchObject({ id: COMMENT_ID });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(COMMENT_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(COMMENT_ID)).rejects.toBe(failure);
    });
  });

  describe('findByStory', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: COMMENT_ID }], [{ total: 1 }]);

      await expect(repository.findByStory(STORY_ID, 1, 20)).resolves.toEqual({
        comments: [{ id: COMMENT_ID }],
        total: 1,
      });
    });

    it('uses one shared visibility predicate for the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByStory(STORY_ID, 1, 20);

      // If the page and the count disagreed, `total` would not match the rows returned.
      expect(whereOf(1)).toBe(whereOf(0));
    });

    it('expresses "top level" with isNull, not an equality test against null', async () => {
      // `eq(parentId, null)` compiles to `parent_id = NULL`, which matches no row at all.
      control.queue([], [{ total: 0 }]);

      await repository.findByStory(STORY_ID, 1, 20);

      expect(whereOf()).toEqual(
        and(eq(comments.storyId, STORY_ID), isNull(comments.parentId), eq(comments.isDeleted, false)),
      );
    });

    it('paginates with limit and a zero-based offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByStory(STORY_ID, 3, 10);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([20]);
    });

    it('orders newest first', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByStory(STORY_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(comments.createdAt)]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '7' }]);

      await expect(repository.findByStory(STORY_ID, 1, 20)).resolves.toMatchObject({ total: 7 });
    });

    it('reads from the comments table', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findByStory(STORY_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([comments]);
    });
  });

  describe('findReplies', () => {
    it('returns the replies and their total', async () => {
      control.queue([{ id: COMMENT_ID }], [{ total: 1 }]);

      await expect(repository.findReplies(PARENT_ID, 1, 20)).resolves.toEqual({
        replies: [{ id: COMMENT_ID }],
        total: 1,
      });
    });

    it('excludes soft-deleted replies', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findReplies(PARENT_ID, 1, 20);

      expect(whereOf()).toEqual(and(eq(comments.parentId, PARENT_ID), eq(comments.isDeleted, false)));
    });

    it('uses one shared visibility predicate for the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findReplies(PARENT_ID, 1, 20);

      expect(whereOf(1)).toBe(whereOf(0));
    });

    it('paginates replies with limit and a zero-based offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findReplies(PARENT_ID, 2, 5);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([5]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([5]);
    });
  });

  describe('create', () => {
    it('inserts the row and returns the inserted comment', async () => {
      control.queue([{ id: COMMENT_ID, storyId: STORY_ID, authorId: AUTHOR_ID, content: 'hello' }]);

      const created = await repository.create({ storyId: STORY_ID, authorId: AUTHOR_ID, content: 'hello' });

      expect(created).toMatchObject({ id: COMMENT_ID });
      expect(db.insert).toHaveBeenCalledWith(comments);
    });

    it('passes a parentId through so a reply is stored as a reply', async () => {
      control.queue([{ id: COMMENT_ID, parentId: PARENT_ID }]);

      await repository.create({ storyId: STORY_ID, authorId: AUTHOR_ID, content: 'r', parentId: PARENT_ID });

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([
        { storyId: STORY_ID, authorId: AUTHOR_ID, content: 'r', parentId: PARENT_ID },
      ]);
    });
  });

  describe('update', () => {
    it('writes the patch, stamps updatedAt, and returns the updated row', async () => {
      control.queue([{ id: COMMENT_ID, content: 'edited' }]);

      const updated = await repository.update(COMMENT_ID, { content: 'edited' });

      expect(updated).toMatchObject({ content: 'edited' });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ content: 'edited' });
      expect(patch.updatedAt).toBeInstanceOf(Date);
    });

    it('narrows the write to the requested row', async () => {
      control.queue([{ id: COMMENT_ID }]);

      await repository.update(COMMENT_ID, { content: 'edited' });

      expect(callsOf(chains[0]!, 'where')).toHaveLength(1);
      expect(db.update).toHaveBeenCalledWith(comments);
    });
  });

  describe('softDelete', () => {
    it('flags the row as deleted with a deletion timestamp instead of removing it', async () => {
      control.queue([]);

      await repository.softDelete(COMMENT_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ isDeleted: true });
      expect(patch.deletedAt).toBeInstanceOf(Date);
      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  describe('incrementReplyCount', () => {
    it('adds one to the denormalized reply count', async () => {
      control.queue([]);

      await repository.incrementReplyCount(PARENT_ID);

      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toHaveProperty('replyCount');
      expect(whereOf()).toEqual(eq(comments.id, PARENT_ID));
    });
  });

  describe('countReplies', () => {
    it('counts only live replies', async () => {
      control.queue([{ total: 4 }]);

      await expect(repository.countReplies(PARENT_ID)).resolves.toBe(4);

      expect(whereOf()).toEqual(and(eq(comments.parentId, PARENT_ID), eq(comments.isDeleted, false)));
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([{ total: '12' }]);

      await expect(repository.countReplies(PARENT_ID)).resolves.toBe(12);
    });
  });
});
