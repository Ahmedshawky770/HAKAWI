import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { IContestsRepository } from '../interfaces/contests-repository.interface.ts';
import { CONTESTS_REPOSITORY } from '../interfaces/contests-repository.interface.ts';
import type { NotificationsService } from '../../notifications/notifications.service.ts';

import { ContestsEventHandler } from './contests.event-handler.ts';

/**
 * These nine handlers were a `logger.info` each, and the tests asserted the log line. That is a test
 * asserting that a log statement happens — which is true of every handler in every codebase, and true
 * whether or not the handler does anything.
 *
 * The roadmap claimed "Contest notifications — event-driven ✅". It was describing nine log lines.
 * These cases assert the notifications instead, and pin the three decisions that matter:
 *
 *  - WHO is told. The submission's AUTHOR, not the contest's. The organiser sees every entry in the
 *    dashboard, so notifying them per entry is not information they lack.
 *  - WHO IS NOT told. `contest.created` notifies nobody — the author just did it — and a writer with
 *    three entries is told once when a contest starts, not three times.
 *  - THAT A FAILURE IS SURVIVED. The vote, the approval and the prize are already committed; a
 *    notification failure must not turn any of them into a 500.
 */
const submission = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'submission-1',
    contestId: 'contest-1',
    storyId: 'story-1',
    authorId: 'author-1',
    status: 'approved',
    submittedAt: new Date(),
    reviewedAt: null,
    reviewedBy: null,
    ...overrides,
  }) as never;

describe('ContestsEventHandler', () => {
  let handler: ContestsEventHandler;
  let repository: { findSubmissionById: ReturnType<typeof vi.fn>; findSubmissionsByContest: ReturnType<typeof vi.fn> };
  let notifications: { create: ReturnType<typeof vi.fn> };
  let logger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    verbose: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    repository = {
      findSubmissionById: vi.fn().mockResolvedValue(submission()),
      findSubmissionsByContest: vi.fn().mockResolvedValue({ submissions: [submission()], total: 1 }),
    };
    notifications = { create: vi.fn().mockResolvedValue({ id: 'notif-1' }) };
    logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn(), verbose: vi.fn() };

    handler = new ContestsEventHandler(
      repository as unknown as IContestsRepository,
      notifications as unknown as NotificationsService,
      logger as unknown as WinstonLoggerService,
    );
  });

  describe('events that notify nobody', () => {
    it('should not notify the author about a contest they just created', async () => {
      await handler.handleContestCreated({ contestId: 'contest-1', createdBy: 'author-1' } as never);

      expect(notifications.create).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });

    it('should not announce the completion a second time after winner.selected', async () => {
      await handler.handleContestCompleted({ contestId: 'contest-1', winnerId: 'author-1' } as never);

      // `winner.selected` already told the winner and `contest.started` already told the entrants.
      // A third announcement from the same action is noise.
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('submission review', () => {
    it('should tell the entry AUTHOR it was submitted', async () => {
      await handler.handleSubmissionSubmitted({
        submissionId: 'submission-1',
        contestId: 'contest-1',
        authorId: 'author-1',
      } as never);

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'author-1', title: expect.stringContaining('submitted') }),
      );
    });

    it('should tell the entry AUTHOR it was approved', async () => {
      await handler.handleSubmissionApproved({
        submissionId: 'submission-1',
        contestId: 'contest-1',
        authorId: 'author-1',
      } as never);

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'author-1', title: expect.stringContaining('approved') }),
      );
    });

    it('should tell the entry AUTHOR it was rejected, rather than saying nothing', async () => {
      await handler.handleSubmissionRejected({
        submissionId: 'submission-1',
        contestId: 'contest-1',
        authorId: 'author-1',
      } as never);

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'author-1', title: expect.stringContaining('not accepted') }),
      );
    });
  });

  describe('voting', () => {
    it('should tell the AUTHOR of the voted-for story, not the voter', async () => {
      await handler.handleVoteCast({
        voteId: 'vote-1',
        contestId: 'contest-1',
        submissionId: 'submission-1',
        userId: 'voter-1',
      } as never);

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'author-1', title: expect.stringContaining('vote') }),
      );
    });

    it('should not tell a voter about their own vote', async () => {
      repository.findSubmissionById.mockResolvedValue(submission({ authorId: 'voter-1' }));

      await handler.handleVoteCast({
        voteId: 'vote-1',
        contestId: 'contest-1',
        submissionId: 'submission-1',
        userId: 'voter-1',
      } as never);

      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('contest start', () => {
    it('should tell every entrant', async () => {
      repository.findSubmissionsByContest.mockResolvedValue({
        submissions: [submission(), submission({ id: 'submission-2', authorId: 'author-2' })],
        total: 2,
      });
      // ID-AWARE, because the handler resolves each entry's author by id. A single fixed return value
      // would report the same author twice and the de-duplication would collapse them to one
      // notification — so the test would pass for the wrong reason.
      repository.findSubmissionById.mockImplementation(async (id: string) =>
        id === 'submission-2' ? submission({ id, authorId: 'author-2' }) : submission({ id }),
      );

      await handler.handleContestStarted({ contestId: 'contest-1' } as never);

      expect(notifications.create).toHaveBeenCalledTimes(2);
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'author-1' }));
      expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'author-2' }));
    });

    it('should tell a writer with three entries ONCE, not three times', async () => {
      repository.findSubmissionsByContest.mockResolvedValue({
        submissions: [submission(), submission({ id: 'submission-2' }), submission({ id: 'submission-3' })],
        total: 3,
      });

      await handler.handleContestStarted({ contestId: 'contest-1' } as never);

      // All three share `authorId: 'author-1'`. Three notifications would be three chances to mute
      // the app and lose the one you wanted.
      expect(notifications.create).toHaveBeenCalledTimes(1);
    });

    it('should notify nobody for a contest with no entries', async () => {
      repository.findSubmissionsByContest.mockResolvedValue({ submissions: [], total: 0 });

      await handler.handleContestStarted({ contestId: 'contest-1' } as never);

      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe('winner and prize', () => {
    it('should congratulate the winner', async () => {
      await handler.handleWinnerSelected({
        contestId: 'contest-1',
        submissionId: 'submission-1',
        winnerId: 'author-1',
      } as never);

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'author-1', type: 'contest' }),
      );
    });

    it('should tell the winner their prize was sent', async () => {
      await handler.handlePrizeDistributed({
        prizeId: 'prize-1',
        contestId: 'contest-1',
        winnerId: 'author-1',
      } as never);

      // `payment` is the family that maps to the `system` preference column — a prize is a payment.
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'author-1', type: 'payment' }),
      );
    });
  });

  describe('a notification failure is survived', () => {
    it('should log and swallow a failure rather than failing the action behind it', async () => {
      // The vote, the approval and the prize distribution are already committed by the time this
      // runs. Throwing here would report one of them as failed and, for a vote, invite a retry that
      // collides with the unique index.
      notifications.create.mockRejectedValue(new Error('notifications table unavailable'));

      await expect(
        handler.handleVoteCast({
          voteId: 'vote-1',
          contestId: 'contest-1',
          submissionId: 'submission-1',
          userId: 'voter-1',
        } as never),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalled();
    });
  });
});
