import { describe, it, expect, beforeEach, vi } from 'vitest';
import { and, desc, eq, like, sql } from 'drizzle-orm';

import { contests, contestPrizes, contestSubmissions, contestVotes } from '../../../db/schema/contests.schema.ts';
import { categories } from '../../../db/schema/stories.schema.ts';
import {
  installMockDb,
  callsOf,
  firstArgsOf,
  type MockChain,
  type MockDbControl,
} from '../../../test/helpers/mock-db.ts';

import { ContestsRepository } from './contests.repository.ts';

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

const CONTEST_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
const SUBMISSION_ID = '33333333-3333-4333-8333-333333333333';
const STORY_ID = '44444444-4444-4444-8444-444444444444';
const AUTHOR_ID = '55555555-5555-4555-8555-555555555555';
const REVIEWER_ID = '66666666-6666-4666-8666-666666666666';
const VOTER_ID = '77777777-7777-4777-8777-777777777777';
const PRIZE_ID = '88888888-8888-4888-8888-888888888888';

describe('ContestsRepository', () => {
  let repository: ContestsRepository;
  let chains: MockChain[];
  let control: MockDbControl;

  /** The `where` clause the nth query built in this test was given. */
  const whereOf = (index = 0): unknown => firstArgsOf(chains[index]!, 'where')?.[0];

  beforeEach(() => {
    vi.clearAllMocks();
    control = installMockDb(db);
    chains = control.chains();
    repository = new ContestsRepository(logger as never);
  });

  describe('findContestById', () => {
    it('returns the contest when one matches', async () => {
      control.queue([{ id: CONTEST_ID, status: 'active' }]);

      await expect(repository.findContestById(CONTEST_ID)).resolves.toMatchObject({ id: CONTEST_ID });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findContestById(CONTEST_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findContestById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findContestById(CONTEST_ID)).rejects.toBe(failure);
    });
  });

  describe('findAllContests', () => {
    it('returns the page and the total', async () => {
      control.queue([{ id: CONTEST_ID }], [{ total: 1 }]);

      await expect(repository.findAllContests({})).resolves.toEqual({
        contests: [{ id: CONTEST_ID }],
        total: 1,
      });
    });

    it('returns an empty page and a zero total when nothing matches', async () => {
      control.queue([], [{ total: 0 }]);

      await expect(repository.findAllContests({ status: 'completed' })).resolves.toEqual({ contests: [], total: 0 });
    });

    it('defaults to the first page of twenty with a zero-based offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAllContests({});

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([20]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([0]);
    });

    it('paginates with a zero-based offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAllContests({ page: 4, limit: 10 });

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([30]);
    });

    it('orders newest first', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAllContests({});

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(contests.createdAt)]);
    });

    it('leaves the filter unset when no filter is supplied', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAllContests({});

      // An unfiltered listing must reach every contest, so the clause is `undefined`
      // rather than an `and()` over an empty list that would compile to `true`.
      expect(firstArgsOf(chains[0]!, 'where')).toEqual([undefined]);
      expect(firstArgsOf(chains[1]!, 'where')).toEqual([undefined]);
    });

    it('adds one condition per supplied filter', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAllContests({ categoryId: CATEGORY_ID, status: 'active', search: 'night' });

      expect(whereOf()).toEqual(
        and(eq(contests.categoryId, CATEGORY_ID), eq(contests.status, 'active'), like(contests.title, '%night%')),
      );
    });

    it('leaves out the filters that were not supplied', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAllContests({ status: 'active' });

      expect(whereOf()).toEqual(and(eq(contests.status, 'active')));
    });

    it('uses one shared filter for the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAllContests({ categoryId: CATEGORY_ID });

      // If the page and the count disagreed, `total` would not match the rows returned.
      expect(whereOf(1)).toBe(whereOf(0));
    });

    it('reads the page from the contests table', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findAllContests({});

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([contests]);
      expect(firstArgsOf(chains[1]!, 'from')).toEqual([contests]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '7' }]);

      await expect(repository.findAllContests({})).resolves.toMatchObject({ total: 7 });
    });
  });

  describe('createContest', () => {
    it('inserts the row and returns the inserted contest', async () => {
      control.queue([{ id: CONTEST_ID, title: 'Winter Contest' }]);

      const created = await repository.createContest({
        title: 'Winter Contest',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        submissionDeadline: new Date('2026-01-20'),
        createdBy: AUTHOR_ID,
        status: 'draft',
      });

      expect(created).toMatchObject({ id: CONTEST_ID });
      expect(db.insert).toHaveBeenCalledWith(contests);
    });

    it('stores the author and the status the caller chose', async () => {
      control.queue([{ id: CONTEST_ID }]);

      const data = {
        title: 'Winter Contest',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-02-01'),
        submissionDeadline: new Date('2026-01-20'),
        createdBy: AUTHOR_ID,
        status: 'active',
      };
      await repository.createContest(data);

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([data]);
    });
  });

  describe('updateContest', () => {
    it('writes the patch, stamps updatedAt, and returns the updated row', async () => {
      control.queue([{ id: CONTEST_ID, status: 'completed' }]);

      const updated = await repository.updateContest(CONTEST_ID, { status: 'completed' });

      expect(updated).toMatchObject({ status: 'completed' });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ status: 'completed' });
      expect(patch.updatedAt).toBeInstanceOf(Date);
    });

    it('narrows the write to the requested row', async () => {
      control.queue([{ id: CONTEST_ID }]);

      await repository.updateContest(CONTEST_ID, { winnerId: AUTHOR_ID });

      expect(callsOf(chains[0]!, 'where')).toHaveLength(1);
      expect(whereOf()).toEqual(eq(contests.id, CONTEST_ID));
      expect(db.update).toHaveBeenCalledWith(contests);
    });
  });

  describe('findCategoriesByIds', () => {
    it('returns the id and name of each requested category', async () => {
      control.queue([{ id: CATEGORY_ID, name: 'Speculative' }]);

      await expect(repository.findCategoriesByIds([CATEGORY_ID])).resolves.toEqual([
        { id: CATEGORY_ID, name: 'Speculative' },
      ]);
    });

    it('selects only the two columns the response mapper needs', async () => {
      control.queue([{ id: CATEGORY_ID, name: 'Speculative' }]);

      await repository.findCategoriesByIds([CATEGORY_ID]);

      // A contest row carries a `category_id` UUID, which is not displayable. Only the name is.
      expect(firstArgsOf(chains[0]!, 'from')).toEqual([categories]);
      expect(callsOf(chains[0]!, 'where')).toHaveLength(1);
    });

    it('issues no query for an empty id list, because IN () is not valid SQL', async () => {
      await expect(repository.findCategoriesByIds([])).resolves.toEqual([]);

      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('findSubmissionById', () => {
    it('returns the submission when one matches', async () => {
      control.queue([{ id: SUBMISSION_ID, contestId: CONTEST_ID }]);

      await expect(repository.findSubmissionById(SUBMISSION_ID)).resolves.toMatchObject({ id: SUBMISSION_ID });
      expect(firstArgsOf(chains[0]!, 'from')).toEqual([contestSubmissions]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findSubmissionById(SUBMISSION_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findSubmissionById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findSubmissionById(SUBMISSION_ID)).rejects.toBe(failure);
    });
  });

  describe('findSubmissionsByContest', () => {
    it('returns the submissions and their total', async () => {
      control.queue([{ id: SUBMISSION_ID }], [{ total: 1 }]);

      await expect(repository.findSubmissionsByContest(CONTEST_ID, 1, 20)).resolves.toEqual({
        submissions: [{ id: SUBMISSION_ID }],
        total: 1,
      });
    });

    it('paginates with a zero-based offset', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findSubmissionsByContest(CONTEST_ID, 2, 10);

      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([10]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([10]);
    });

    it('orders most recently submitted first', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findSubmissionsByContest(CONTEST_ID, 1, 20);

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(contestSubmissions.submittedAt)]);
    });

    it('applies the same contest predicate to the page and the count', async () => {
      control.queue([], [{ total: 0 }]);

      await repository.findSubmissionsByContest(CONTEST_ID, 1, 20);

      // The two queries build their own `eq()` rather than sharing one clause object, so
      // this compares structurally; what matters is that neither one can drift.
      expect(whereOf(0)).toEqual(eq(contestSubmissions.contestId, CONTEST_ID));
      expect(whereOf(1)).toEqual(whereOf(0));
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([], [{ total: '12' }]);

      await expect(repository.findSubmissionsByContest(CONTEST_ID, 1, 20)).resolves.toMatchObject({ total: 12 });
    });
  });

  describe('findSubmissionByContestAndAuthor', () => {
    it('returns the author submission for that contest', async () => {
      control.queue([{ id: SUBMISSION_ID, authorId: AUTHOR_ID }]);

      await expect(repository.findSubmissionByContestAndAuthor(CONTEST_ID, AUTHOR_ID)).resolves.toMatchObject({
        id: SUBMISSION_ID,
      });
    });

    it('constrains both the contest and the author, which is the pair the service checks for duplicates', async () => {
      control.queue([{ id: SUBMISSION_ID }]);

      await repository.findSubmissionByContestAndAuthor(CONTEST_ID, AUTHOR_ID);

      expect(whereOf()).toEqual(
        and(eq(contestSubmissions.contestId, CONTEST_ID), eq(contestSubmissions.authorId, AUTHOR_ID)),
      );
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the author has not submitted to that contest', async () => {
      control.queue([]);

      await expect(repository.findSubmissionByContestAndAuthor(CONTEST_ID, AUTHOR_ID)).resolves.toBeNull();
    });
  });

  describe('createSubmission', () => {
    it('inserts the row and returns the inserted submission', async () => {
      control.queue([{ id: SUBMISSION_ID, storyId: STORY_ID }]);

      const created = await repository.createSubmission({
        contestId: CONTEST_ID,
        storyId: STORY_ID,
        authorId: AUTHOR_ID,
      });

      expect(created).toMatchObject({ id: SUBMISSION_ID });
      expect(db.insert).toHaveBeenCalledWith(contestSubmissions);
    });

    it('passes the submission input through to values unchanged', async () => {
      control.queue([{ id: SUBMISSION_ID }]);

      const data = { contestId: CONTEST_ID, storyId: STORY_ID, authorId: AUTHOR_ID };
      await repository.createSubmission(data);

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([data]);
    });
  });

  describe('reviewSubmission', () => {
    it('records the verdict, the reviewer and the review timestamp', async () => {
      control.queue([{ id: SUBMISSION_ID, status: 'approved' }]);

      const reviewed = await repository.reviewSubmission(SUBMISSION_ID, 'approved', REVIEWER_ID);

      expect(reviewed).toMatchObject({ status: 'approved' });
      const [patch] = firstArgsOf(chains[0]!, 'set') as [Record<string, unknown>];
      expect(patch).toMatchObject({ status: 'approved', reviewedBy: REVIEWER_ID });
      expect(patch.reviewedAt).toBeInstanceOf(Date);
    });

    it('narrows the write to the requested submission', async () => {
      control.queue([{ id: SUBMISSION_ID }]);

      await repository.reviewSubmission(SUBMISSION_ID, 'rejected', REVIEWER_ID);

      expect(whereOf()).toEqual(eq(contestSubmissions.id, SUBMISSION_ID));
      expect(db.update).toHaveBeenCalledWith(contestSubmissions);
    });
  });

  describe('findVoteById', () => {
    it('returns the vote when one matches', async () => {
      control.queue([{ id: SUBMISSION_ID, userId: VOTER_ID }]);

      await expect(repository.findVoteById(SUBMISSION_ID)).resolves.toMatchObject({ userId: VOTER_ID });
      expect(firstArgsOf(chains[0]!, 'from')).toEqual([contestVotes]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findVoteById(SUBMISSION_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findVoteById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findVoteById(SUBMISSION_ID)).rejects.toBe(failure);
    });
  });

  describe('findVoteByUserContestSubmission', () => {
    it('returns the vote the user already cast on that submission', async () => {
      control.queue([{ id: SUBMISSION_ID, contestId: CONTEST_ID, submissionId: SUBMISSION_ID, userId: VOTER_ID }]);

      await expect(
        repository.findVoteByUserContestSubmission(CONTEST_ID, SUBMISSION_ID, VOTER_ID),
      ).resolves.toMatchObject({ userId: VOTER_ID });
    });

    it('covers all three columns of the one-vote-per-user index', async () => {
      control.queue([{ id: SUBMISSION_ID }]);

      await repository.findVoteByUserContestSubmission(CONTEST_ID, SUBMISSION_ID, VOTER_ID);

      // The unique index is (contest_id, submission_id, user_id); matching only part of it
      // would let the duplicate-vote check in the service pass while the insert conflicts.
      expect(whereOf()).toEqual(
        and(
          eq(contestVotes.contestId, CONTEST_ID),
          eq(contestVotes.submissionId, SUBMISSION_ID),
          eq(contestVotes.userId, VOTER_ID),
        ),
      );
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('returns null when the user has not voted on that submission', async () => {
      control.queue([]);

      await expect(repository.findVoteByUserContestSubmission(CONTEST_ID, SUBMISSION_ID, VOTER_ID)).resolves.toBeNull();
    });
  });

  describe('countVotesBySubmission', () => {
    it('counts the votes cast on a submission', async () => {
      control.queue([{ total: 4 }]);

      await expect(repository.countVotesBySubmission(SUBMISSION_ID)).resolves.toBe(4);

      expect(whereOf()).toEqual(eq(contestVotes.submissionId, SUBMISSION_ID));
    });

    it('counts votes across every contest for a submission row', async () => {
      control.queue([{ total: 0 }]);

      await repository.countVotesBySubmission(SUBMISSION_ID);

      expect(callsOf(chains[0]!, 'where')).toHaveLength(1);
      expect(firstArgsOf(chains[0]!, 'from')).toEqual([contestVotes]);
    });

    it('coerces a count delivered as text to a number', async () => {
      control.queue([{ total: '12' }]);

      await expect(repository.countVotesBySubmission(SUBMISSION_ID)).resolves.toBe(12);
    });
  });

  describe('countVotesByContest', () => {
    it('returns the contest total as a string, the shape the interface declares', async () => {
      control.queue([{ total: 9 }]);

      // The service destructures `{ total }` and coerces at the edge, so the string must
      // survive this boundary rather than being silently narrowed here.
      await expect(repository.countVotesByContest(CONTEST_ID)).resolves.toEqual({ total: '9' });

      expect(whereOf()).toEqual(eq(contestVotes.contestId, CONTEST_ID));
    });

    it('coerces a count delivered as text without changing the declared shape', async () => {
      control.queue([{ total: '12' }]);

      await expect(repository.countVotesByContest(CONTEST_ID)).resolves.toEqual({ total: '12' });
    });
  });

  describe('findVotesBySubmission', () => {
    it('returns the votes newest first', async () => {
      control.queue([{ id: SUBMISSION_ID }, { id: VOTER_ID }]);

      await expect(repository.findVotesBySubmission(SUBMISSION_ID)).resolves.toHaveLength(2);

      expect(whereOf()).toEqual(eq(contestVotes.submissionId, SUBMISSION_ID));
      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(contestVotes.createdAt)]);
    });

    it('returns an empty array when the submission has no votes', async () => {
      control.queue([]);

      await expect(repository.findVotesBySubmission(SUBMISSION_ID)).resolves.toEqual([]);
    });
  });

  describe('findVotesByContest', () => {
    it('passes the caller window through as limit and offset', async () => {
      control.queue([{ id: SUBMISSION_ID }]);

      await expect(repository.findVotesByContest(CONTEST_ID, 5, 10)).resolves.toHaveLength(1);

      // This method takes an offset, not a page: the service owns the page arithmetic.
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([5]);
      expect(firstArgsOf(chains[0]!, 'offset')).toEqual([10]);
      expect(whereOf()).toEqual(eq(contestVotes.contestId, CONTEST_ID));
    });

    it('orders newest first', async () => {
      control.queue([]);

      await repository.findVotesByContest(CONTEST_ID, 20, 0);

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(contestVotes.createdAt)]);
    });
  });

  describe('castVote', () => {
    it('inserts the row and returns the inserted vote', async () => {
      control.queue([{ id: SUBMISSION_ID, contestId: CONTEST_ID }]);

      const vote = await repository.castVote({ contestId: CONTEST_ID, submissionId: SUBMISSION_ID, userId: VOTER_ID });

      expect(vote).toMatchObject({ id: SUBMISSION_ID });
      expect(db.insert).toHaveBeenCalledWith(contestVotes);
    });

    it('passes the vote input through to values unchanged', async () => {
      control.queue([{ id: SUBMISSION_ID }]);

      const data = { contestId: CONTEST_ID, submissionId: SUBMISSION_ID, userId: VOTER_ID };
      await repository.castVote(data);

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([data]);
    });
  });

  describe('findPrizeById', () => {
    it('returns the prize when one matches', async () => {
      control.queue([{ id: PRIZE_ID, prizeType: 'book' }]);

      await expect(repository.findPrizeById(PRIZE_ID)).resolves.toMatchObject({ id: PRIZE_ID });
      expect(firstArgsOf(chains[0]!, 'from')).toEqual([contestPrizes]);
    });

    it('returns null when the select yields no row', async () => {
      control.queue([]);

      await expect(repository.findPrizeById(PRIZE_ID)).resolves.toBeNull();
    });

    it('returns null instead of throwing on an invalid-uuid database error', async () => {
      control.queueRejection(Object.assign(new Error('invalid input syntax for uuid'), { code: '22P02' }));

      await expect(repository.findPrizeById('not-a-uuid')).resolves.toBeNull();
    });

    it('rethrows any other database error', async () => {
      const failure = Object.assign(new Error('connection terminated'), { code: '08006' });
      control.queueRejection(failure);

      await expect(repository.findPrizeById(PRIZE_ID)).rejects.toBe(failure);
    });
  });

  describe('createPrize', () => {
    it('inserts the row and returns the inserted prize', async () => {
      control.queue([{ id: PRIZE_ID, prizeType: 'book' }]);

      const prize = await repository.createPrize({
        contestId: CONTEST_ID,
        submissionId: SUBMISSION_ID,
        winnerId: AUTHOR_ID,
        prizeType: 'book',
      });

      expect(prize).toMatchObject({ id: PRIZE_ID });
      expect(db.insert).toHaveBeenCalledWith(contestPrizes);
    });

    it('passes the prize input through to values unchanged', async () => {
      control.queue([{ id: PRIZE_ID }]);

      const data = {
        contestId: CONTEST_ID,
        submissionId: SUBMISSION_ID,
        winnerId: AUTHOR_ID,
        prizeType: 'book',
        prizeDescription: 'Signed copy',
      };
      await repository.createPrize(data);

      expect(firstArgsOf(chains[0]!, 'values')).toEqual([data]);
    });
  });

  describe('findPrizesByContest', () => {
    it('returns the prizes newest first', async () => {
      control.queue([{ id: PRIZE_ID }]);

      await expect(repository.findPrizesByContest(CONTEST_ID)).resolves.toEqual([{ id: PRIZE_ID }]);

      expect(firstArgsOf(chains[0]!, 'from')).toEqual([contestPrizes]);
      expect(whereOf()).toEqual(eq(contestPrizes.contestId, CONTEST_ID));
      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([desc(contestPrizes.createdAt)]);
    });

    it('returns an empty array when the contest has distributed nothing', async () => {
      control.queue([]);

      await expect(repository.findPrizesByContest(CONTEST_ID)).resolves.toEqual([]);
    });
  });

  describe('findWinningSubmission', () => {
    it('returns the winning submission row', async () => {
      control.queue([{ id: SUBMISSION_ID, contestId: CONTEST_ID, authorId: AUTHOR_ID }]);

      await expect(repository.findWinningSubmission(CONTEST_ID)).resolves.toMatchObject({ id: SUBMISSION_ID });
    });

    it('returns null when the contest has no submissions', async () => {
      control.queue([]);

      await expect(repository.findWinningSubmission(CONTEST_ID)).resolves.toBeNull();
    });

    it('ranks by vote count and takes only the top row', async () => {
      control.queue([{ id: SUBMISSION_ID }]);

      await repository.findWinningSubmission(CONTEST_ID);

      expect(firstArgsOf(chains[0]!, 'orderBy')).toEqual([sql`count(${contestVotes.id}) DESC`]);
      expect(firstArgsOf(chains[0]!, 'limit')).toEqual([1]);
    });

    it('left-joins the votes onto the submissions so an unvoted entry still counts as zero', async () => {
      control.queue([{ id: SUBMISSION_ID }]);

      await repository.findWinningSubmission(CONTEST_ID);

      expect(firstArgsOf(chains[0]!, 'leftJoin')).toEqual([
        contestVotes,
        eq(contestVotes.submissionId, contestSubmissions.id),
      ]);
      expect(whereOf()).toEqual(eq(contestSubmissions.contestId, CONTEST_ID));
    });

    it('groups by every column it selects, as the vote count is an aggregate', async () => {
      control.queue([{ id: SUBMISSION_ID }]);

      await repository.findWinningSubmission(CONTEST_ID);

      // Postgres rejects a grouped query that leaves a selected column out of the
      // GROUP BY, so the projection and this list have to move together.
      expect(callsOf(chains[0]!, 'groupBy')).toHaveLength(1);
      expect(firstArgsOf(chains[0]!, 'groupBy')).toEqual([
        contestSubmissions.id,
        contestSubmissions.contestId,
        contestSubmissions.storyId,
        contestSubmissions.authorId,
        contestSubmissions.status,
        contestSubmissions.submittedAt,
        contestSubmissions.reviewedAt,
        contestSubmissions.reviewedBy,
      ]);
    });
  });
});
