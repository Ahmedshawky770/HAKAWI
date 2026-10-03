import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { stories } from '../../../db/schema/stories.schema.ts';

import { BadgesService } from '../badges.service.ts';

import { BadgesEventHandler } from './badges.event-handler.ts';

type ChainBuilder = {
  then: (onfulfilled: (value: unknown) => unknown) => Promise<unknown>;
  from: Mock<(table: unknown) => ChainBuilder>;
  where: Mock<(clause: unknown) => ChainBuilder>;
  limit: Mock<(count: number) => ChainBuilder>;
};

type MockLogger = { info: Mock; log: Mock; error: Mock; warn: Mock; debug: Mock; verbose: Mock };

const db = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('../../../db/index.ts', () => ({ db, default: db }));

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

function makeChain(result: unknown): ChainBuilder {
  const chain: ChainBuilder = {
    then: (onfulfilled) => Promise.resolve(result).then(onfulfilled),
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
  };
  return chain;
}

describe('BadgesEventHandler', () => {
  let handler: BadgesEventHandler;
  let badgesService: { evaluateForUser: Mock<(userId: string, trigger: string) => Promise<unknown[]>> };
  let logger: MockLogger;

  beforeEach(() => {
    db.select.mockReset();
    logger = { info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() };
    badgesService = {
      evaluateForUser: vi.fn<(userId: string, trigger: string) => Promise<unknown[]>>().mockResolvedValue([]),
    };
    handler = new BadgesEventHandler(
      badgesService as unknown as BadgesService,
      logger as unknown as WinstonLoggerService,
    );
  });

  it('should evaluate the winner of a selected contest', async () => {
    await handler.handleWinnerSelected({ contestId: 'c-1', submissionId: 's-1', winnerId: USER_ID });

    expect(badgesService.evaluateForUser).toHaveBeenCalledWith(USER_ID, 'winner.selected');
  });

  it('should evaluate the winner of a completed contest', async () => {
    await handler.handleContestCompleted({ contestId: 'c-1', winnerId: USER_ID });

    expect(badgesService.evaluateForUser).toHaveBeenCalledWith(USER_ID, 'contest.completed');
  });

  it('should ignore a completed contest with no winner', async () => {
    await handler.handleContestCompleted({ contestId: 'c-1', winnerId: null });

    expect(badgesService.evaluateForUser).not.toHaveBeenCalled();
  });

  it('should evaluate the author of a published story', async () => {
    const selectChain = makeChain([{ authorId: USER_ID }]);
    db.select.mockReturnValue(selectChain);

    await handler.handleStoryPublished({ storyId: 'story-1', publishedAt: new Date() });

    expect(selectChain.from).toHaveBeenCalledWith(stories);
    expect(badgesService.evaluateForUser).toHaveBeenCalledWith(USER_ID, 'story.published');
  });

  it('should give up when the published story is gone', async () => {
    db.select.mockReturnValue(makeChain([]));

    await handler.handleStoryPublished({ storyId: 'story-9', publishedAt: new Date() });

    expect(badgesService.evaluateForUser).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should evaluate the followed user for a follower milestone', async () => {
    await handler.handleUserFollowed({ followerId: 'a', followingId: USER_ID });

    expect(badgesService.evaluateForUser).toHaveBeenCalledWith(USER_ID, 'user.followed');
  });

  it('should evaluate the moderator for a moderation milestone', async () => {
    await handler.handleModerationActionTaken({
      actionId: 'a-1',
      reportId: 'r-1',
      adminId: USER_ID,
      targetUserId: 't-1',
      action: 'warn',
      reason: 'because',
    });

    expect(badgesService.evaluateForUser).toHaveBeenCalledWith(USER_ID, 'moderation.action.taken');
  });

  it('should log the badges it awarded', async () => {
    badgesService.evaluateForUser.mockResolvedValueOnce([{ id: 'ub-1' }]);

    await handler.handleUserFollowed({ followerId: 'a', followingId: USER_ID });

    expect(logger.info).toHaveBeenCalledWith(
      `Awarded 1 badge(s) to ${USER_ID} after user.followed`,
      'BadgesEventHandler',
    );
  });

  it('should swallow and log a badge failure', async () => {
    badgesService.evaluateForUser.mockRejectedValueOnce(new Error('table missing'));

    await expect(handler.handleUserFollowed({ followerId: 'a', followingId: USER_ID })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      `Badge evaluation failed for user.followed ${USER_ID}: table missing`,
      undefined,
      'BadgesEventHandler',
    );
  });
});
