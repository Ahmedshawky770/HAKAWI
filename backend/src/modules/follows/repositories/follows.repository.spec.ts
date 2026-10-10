import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, desc, eq } from 'drizzle-orm';

import { follows } from '../../../db/schema/social.schema.ts';
import {
  installMockDb,
  callsOf,
  firstArgsOf,
  type MockChain,
  type MockDbControl,
} from '../../../test/helpers/mock-db.ts';

import { FollowsRepository } from './follows.repository.ts';

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

const FOLLOW_ID = '11111111-1111-4111-8111-111111111111';
const FOLLOWER_ID = '22222222-2222-4222-8222-222222222222';
const FOLLOWING_ID = '33333333-3333-4333-8333-333333333333';

describe('FollowsRepository', () => {
  let repository: FollowsRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new FollowsRepository(logger as never);
  });

  describe('findById', () => {
    it('returns the follow when one matches', async () => {
      control.queue([{ id: FOLLOW_ID, followerId: FOLLOWER_ID, followingId: FOLLOWING_ID }]);

      await expect(repository.findById(FOLLOW_ID)).resolves.toMatchObject({ id: FOLLOW_ID });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('reads a single row from the follows table by primary key', async () => {
      control.queue([{ id: FOLLOW_ID }]);

      await repository.findById(FOLLOW_ID);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([follows]);
      expect(whereOf()).toEqual(eq(follows.id, FOLLOW_ID));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findById(FOLLOW_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findById(FOLLOW_ID)).rejects.toBe(failure);
    });
  });

  describe('findByUsers', () => {
    it('returns the follow edge between the two users', async () => {
      control.queue([{ id: FOLLOW_ID, followerId: FOLLOWER_ID, followingId: FOLLOWING_ID }]);

      await expect(repository.findByUsers(FOLLOWER_ID, FOLLOWING_ID)).resolves.toMatchObject({ id: FOLLOW_ID });
    });

    it('matches on both columns together so a follow in the other direction is not found', async () => {
      // `follows` has a unique (follower_id, following_id) index, so an AND of the two
      // columns is the only predicate that identifies one edge.
      control.queue([{ id: FOLLOW_ID }]);

      await repository.findByUsers(FOLLOWER_ID, FOLLOWING_ID);

      expect(whereOf()).toEqual(and(eq(follows.followerId, FOLLOWER_ID), eq(follows.followingId, FOLLOWING_ID)));
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the two users are not connected', async () => {
      control.queue([]);

      await expect(repository.findByUsers(FOLLOWER_ID, FOLLOWING_ID)).resolves.toBeNull();
    });
  });

  describe('findFollowers', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: FOLLOW_ID }], [{ total: 1 }]);

      await expect(repository.findFollowers(FOLLOWING_ID, 1, 20)).resolves.toEqual({
        follows: [{ id: FOLLOW_ID }],
        total: 1,
      });
    });

    it('selects the rows whose followingId is the user, not whose followerId is', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findFollowers(FOLLOWING_ID, 1, 20);

      expect(whereOf(0)).toEqual(eq(follows.followingId, FOLLOWING_ID));
    });

    it('uses the same predicate for the page and the count', async () => {
      // If the page and the count disagreed, `total` would not match the rows returned.
      control.queue([], [{ total: 0 }]);

      await repository.findFollowers(FOLLOWING_ID, 1, 20);

      expect(whereOf(1)).toEqual(whereOf(0));
    });

    it('paginates with limit and a zero-based offset on the first page', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findFollowers(FOLLOWING_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('offsets by whole pages for any later page', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findFollowers(FOLLOWING_ID, 3, 10);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([20]);
    });

    it('orders newest first', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findFollowers(FOLLOWING_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(follows.createdAt)]);
    });

    it('reads from the follows table', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findFollowers(FOLLOWING_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([follows]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '7' }]);

      await expect(repository.findFollowers(FOLLOWING_ID, 1, 20)).resolves.toMatchObject({ total: 7 });
    });

    it('returns an empty page and a zero total when nobody follows the user', async () => {
      control.queue([], [{ total: 0 }]);

      await expect(repository.findFollowers(FOLLOWING_ID, 1, 20)).resolves.toEqual({ follows: [], total: 0 });
    });
  });

  describe('findFollowing', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: FOLLOW_ID }], [{ total: 1 }]);

      await expect(repository.findFollowing(FOLLOWER_ID, 1, 20)).resolves.toEqual({
        follows: [{ id: FOLLOW_ID }],
        total: 1,
      });
    });

    it('selects the rows whose followerId is the user, not whose followingId is', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findFollowing(FOLLOWER_ID, 1, 20);

      expect(whereOf(0)).toEqual(eq(follows.followerId, FOLLOWER_ID));
    });

    it('uses the same predicate for the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findFollowing(FOLLOWER_ID, 1, 20);

      expect(whereOf(1)).toEqual(whereOf(0));
    });

    it('paginates with limit and a zero-based offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findFollowing(FOLLOWER_ID, 2, 5);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([5]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([5]);
    });

    it('orders newest first', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findFollowing(FOLLOWER_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(follows.createdAt)]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '3' }]);

      await expect(repository.findFollowing(FOLLOWER_ID, 1, 20)).resolves.toMatchObject({ total: 3 });
    });
  });

  describe('create', () => {
    it('inserts the edge and returns the stored follow', async () => {
      control.queue([{ id: FOLLOW_ID, followerId: FOLLOWER_ID, followingId: FOLLOWING_ID }]);

      const created = await repository.create({ followerId: FOLLOWER_ID, followingId: FOLLOWING_ID });

      expect(created).toMatchObject({ id: FOLLOW_ID });
      expect(db.insert).toHaveBeenCalledWith(follows);
    });

    it('writes both user ids onto the row so the direction is preserved', async () => {
      control.queue([{ id: FOLLOW_ID }]);

      await repository.create({ followerId: FOLLOWER_ID, followingId: FOLLOWING_ID });

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([{ followerId: FOLLOWER_ID, followingId: FOLLOWING_ID }]);
    });
  });

  describe('delete', () => {
    it('removes the row by primary key', async () => {
      control.queue([]);

      await repository.delete(FOLLOW_ID);

      expect(db.delete).toHaveBeenCalledWith(follows);
      expect(whereOf()).toEqual(eq(follows.id, FOLLOW_ID));
    });

    it('issues a single narrow delete', async () => {
      control.queue([]);

      await repository.delete(FOLLOW_ID);

      expect(db.delete).toHaveBeenCalledTimes(1);
      expect(callsOf(chains[0]!, 'where')).toHaveLength(1);
    });
  });

  describe('countFollowers', () => {
    it('counts the rows that follow the user', async () => {
      control.queue([{ total: 4 }]);

      await expect(repository.countFollowers(FOLLOWING_ID)).resolves.toBe(4);

      expect(whereOf()).toEqual(eq(follows.followingId, FOLLOWING_ID));
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([{ total: '12' }]);

      await expect(repository.countFollowers(FOLLOWING_ID)).resolves.toBe(12);
    });
  });

  describe('countFollowing', () => {
    it('counts the rows the user follows', async () => {
      control.queue([{ total: 6 }]);

      await expect(repository.countFollowing(FOLLOWER_ID)).resolves.toBe(6);

      expect(whereOf()).toEqual(eq(follows.followerId, FOLLOWER_ID));
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([{ total: '2' }]);

      await expect(repository.countFollowing(FOLLOWER_ID)).resolves.toBe(2);
    });
  });

  describe('isFollowing', () => {
    it('is true when the follow row exists', async () => {
      control.queue([{ id: FOLLOW_ID }]);

      await expect(repository.isFollowing(FOLLOWER_ID, FOLLOWING_ID)).resolves.toBe(true);
    });

    it('is false when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.isFollowing(FOLLOWER_ID, FOLLOWING_ID)).resolves.toBe(false);
    });

    it('answers from the follower/following pair, not from either id alone', async () => {
      control.queue([{ id: FOLLOW_ID }]);

      await repository.isFollowing(FOLLOWER_ID, FOLLOWING_ID);

      expect(whereOf()).toEqual(and(eq(follows.followerId, FOLLOWER_ID), eq(follows.followingId, FOLLOWING_ID)));
    });
  });
});
