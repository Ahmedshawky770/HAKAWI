import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import { stories } from '../../../db/schema/stories.schema.ts';
import { comments } from '../../../db/schema/social.schema.ts';
import { reports } from '../../../db/schema/moderation.schema.ts';

import { ContentModerationService } from './content-moderation.service.ts';

type ChainBuilder = {
  then: (onfulfilled: (value: unknown) => unknown) => Promise<unknown>;
  from: Mock<(table: unknown) => ChainBuilder>;
  values: Mock<(values: Record<string, unknown>) => ChainBuilder>;
  set: Mock<(values: Record<string, unknown>) => ChainBuilder>;
  where: Mock<(clause: unknown) => ChainBuilder>;
  orderBy: Mock<(clause: unknown) => ChainBuilder>;
  limit: Mock<(count: number) => ChainBuilder>;
  offset: Mock<(count: number) => ChainBuilder>;
  returning: Mock<() => ChainBuilder>;
};

type MockLogger = {
  info: Mock;
  log: Mock;
  error: Mock;
  warn: Mock;
  debug: Mock;
  verbose: Mock;
};

type MockEventBus = { emit: Mock<(name: string, payload: unknown) => Promise<void>> };

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../../db/index.ts', () => ({ db, default: db }));

const NOW = new Date('2026-01-01T00:00:00.000Z');
const AUTHOR_ID = '11111111-2222-3333-4444-555555555555';
const TARGET_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';

function makeChain(result: unknown): ChainBuilder {
  const chain: ChainBuilder = {
    then: (onfulfilled) => Promise.resolve(result).then(onfulfilled),
    from: vi.fn(() => chain),
    values: vi.fn(() => chain),
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    returning: vi.fn(() => chain),
  };
  return chain;
}

function reportRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'report-1', reporterId: null, targetId: TARGET_ID, status: 'open', ...overrides };
}

/**
 * A row of the pre-escalation read: the status and `updated_at` the report genuinely held
 * immediately before the conditional UPDATE, which is what the emitted audit event carries.
 */
function openReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'report-1', status: 'open', updatedAt: NOW, ...overrides };
}

describe('ContentModerationService', () => {
  let service: ContentModerationService;
  let logger: MockLogger;
  let eventBus: MockEventBus;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    logger = { info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() };
    eventBus = { emit: vi.fn<(name: string, payload: unknown) => Promise<void>>().mockResolvedValue(undefined) };

    db.select.mockReset();
    db.insert.mockReset();
    db.update.mockReset();
    db.delete.mockReset();

    service = new ContentModerationService(
      logger as unknown as WinstonLoggerService,
      eventBus as unknown as EventValidatorService,
    );
  });

  describe('reviewStory', () => {
    function arrangeStory(text: string): void {
      db.select.mockReturnValueOnce(
        makeChain([{ id: TARGET_ID, authorId: AUTHOR_ID, title: text, excerpt: null, content: null }]),
      );
    }

    /**
     * Queues the two statements `escalate` runs: the read of the currently open reports and
     * the conditional UPDATE that returns the ids it moved. `moved` is what the database
     * actually changed, which is the only honest basis for emitting an event per report.
     */
    function arrangeEscalation(
      open: Array<Record<string, unknown>>,
      moved: Array<Record<string, unknown>> = [{ id: 'report-1' }],
    ): ChainBuilder {
      db.select.mockReturnValueOnce(makeChain(open));
      const chain = makeChain(moved);
      db.update.mockReturnValue(chain);
      return chain;
    }

    it('should do nothing for clean content', async () => {
      arrangeStory('A lighthouse keeper keeps a careful log');

      await expect(service.reviewStory(TARGET_ID)).resolves.toEqual([]);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should do nothing when the story row is gone', async () => {
      db.select.mockReturnValueOnce(makeChain([]));

      await expect(service.reviewStory(TARGET_ID)).resolves.toEqual([]);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should evaluate the title, the excerpt and the body together', async () => {
      db.select.mockReturnValueOnce(
        makeChain([
          { id: TARGET_ID, authorId: AUTHOR_ID, title: 'Clean', excerpt: null, content: 'get free money now' },
        ]),
      );
      db.select.mockReturnValueOnce(makeChain([]));
      const insertChain = makeChain([reportRow()]);
      db.insert.mockReturnValueOnce(insertChain);
      arrangeEscalation([openReport()]);

      const outcomes = await service.reviewStory(TARGET_ID);

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.filed).toBe(true);
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ targetId: TARGET_ID, targetType: 'story', reason: 'auto:prohibited_terms' }),
      );
    });

    it('should announce the report it files', async () => {
      arrangeStory('crypto giveaway inside');
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([reportRow()]));
      arrangeEscalation([openReport()]);

      await service.reviewStory(TARGET_ID);

      expect(eventBus.emit).toHaveBeenCalledWith('moderation.report.created', {
        reportId: 'report-1',
        reporterId: null,
        targetId: TARGET_ID,
        targetType: 'story',
        reason: 'auto:prohibited_terms',
        source: 'auto',
      });
    });

    it('should file an automatic report with no reporter rather than blaming the content author', async () => {
      arrangeStory('crypto giveaway inside');
      db.select.mockReturnValueOnce(makeChain([]));
      const insertChain = makeChain([reportRow()]);
      db.insert.mockReturnValueOnce(insertChain);
      arrangeEscalation([openReport()]);

      await service.reviewStory(TARGET_ID);

      expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ reporterId: null, source: 'auto' }));
    });

    it('should never name the content author as the reporter of an automatic report', async () => {
      arrangeStory('crypto giveaway inside');
      db.select.mockReturnValueOnce(makeChain([]));
      const insertChain = makeChain([reportRow()]);
      db.insert.mockReturnValueOnce(insertChain);
      arrangeEscalation([openReport()]);

      await service.reviewStory(TARGET_ID);

      expect(insertChain.values).toHaveBeenCalledTimes(1);
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ reporterId: null, targetId: TARGET_ID }),
      );
      expect(insertChain.values).not.toHaveBeenCalledWith(expect.objectContaining({ reporterId: AUTHOR_ID }));
    });

    it('should record which rule tripped and why', async () => {
      arrangeStory('crypto giveaway inside');
      db.select.mockReturnValueOnce(makeChain([]));
      const insertChain = makeChain([reportRow()]);
      db.insert.mockReturnValueOnce(insertChain);
      arrangeEscalation([openReport()]);

      await service.reviewStory(TARGET_ID);

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining('crypto giveaway') }),
      );
    });

    it('should escalate a high severity hit immediately', async () => {
      arrangeStory('crypto giveaway inside');
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([reportRow()]));
      const updateChain = arrangeEscalation([openReport()]);

      await service.reviewStory(TARGET_ID);

      expect(db.update).toHaveBeenCalledWith(reports);
      expect(updateChain.set).toHaveBeenCalledWith({ status: 'escalated', escalatedAt: NOW, updatedAt: NOW });
      expect(eventBus.emit).toHaveBeenCalledWith('moderation.report.escalated', {
        reportId: 'report-1',
        targetId: TARGET_ID,
        previousStatus: 'open',
        previousUpdatedAt: NOW,
      });
    });

    it('should publish the updated_at the report held before the write, not the one it was given', async () => {
      const previousUpdatedAt = new Date('2025-12-30T09:08:07.000Z');
      arrangeStory('crypto giveaway inside');
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([reportRow()]));
      arrangeEscalation([openReport({ updatedAt: previousUpdatedAt })]);

      await service.reviewStory(TARGET_ID);

      expect(eventBus.emit).toHaveBeenCalledWith(
        'moderation.report.escalated',
        expect.objectContaining({ previousUpdatedAt }),
      );
      expect(eventBus.emit).not.toHaveBeenCalledWith(
        'moderation.report.escalated',
        expect.objectContaining({ previousUpdatedAt: NOW }),
      );
    });

    it('should escalate one event per report the update actually moved', async () => {
      arrangeStory('crypto giveaway inside');
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([reportRow()]));
      arrangeEscalation(
        [
          openReport({ id: 'report-1' }),
          openReport({ id: 'report-2', updatedAt: new Date('2025-12-30T09:08:07.000Z') }),
          openReport({ id: 'report-3' }),
        ],
        [{ id: 'report-1' }, { id: 'report-2' }, { id: 'report-3' }],
      );

      await service.reviewStory(TARGET_ID);

      expect(eventBus.emit).toHaveBeenCalledWith(
        'moderation.report.escalated',
        expect.objectContaining({ reportId: 'report-1' }),
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        'moderation.report.escalated',
        expect.objectContaining({ reportId: 'report-2' }),
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        'moderation.report.escalated',
        expect.objectContaining({ reportId: 'report-3' }),
      );
      const escalatedCalls = eventBus.emit.mock.calls.filter(
        (call) => (call as [string, unknown])[0] === 'moderation.report.escalated',
      );
      expect(escalatedCalls).toHaveLength(3);
    });

    it('should stay silent about a report the conditional update did not move', async () => {
      arrangeStory('crypto giveaway inside');
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([reportRow()]));
      arrangeEscalation([openReport({ id: 'report-1' }), openReport({ id: 'report-2' })], [{ id: 'report-1' }]);

      await service.reviewStory(TARGET_ID);

      const escalated = eventBus.emit.mock.calls.filter(
        (call) => (call as [string, unknown])[0] === 'moderation.report.escalated',
      );
      expect(escalated).toHaveLength(1);
      expect((escalated[0] as [string, unknown])[1]).toMatchObject({ reportId: 'report-1' });
    });

    it('should not write at all when the target has no open report left', async () => {
      arrangeStory('crypto giveaway inside');
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([reportRow()]));
      db.select.mockReturnValueOnce(makeChain([]));

      await service.reviewStory(TARGET_ID);

      expect(db.update).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalledWith('moderation.report.escalated', expect.anything());
    });

    it('should not escalate a rule configured to stay in the queue', async () => {
      db.select.mockReturnValueOnce(
        makeChain([{ id: TARGET_ID, authorId: AUTHOR_ID, title: `aaaaaaaaaaaa${'b'}`, excerpt: null, content: null }]),
      );
      db.select.mockReturnValueOnce(makeChain([]));
      db.insert.mockReturnValue(makeChain([reportRow({ reason: 'auto:character_repetition' })]));

      const outcomes = await service.reviewStory(TARGET_ID);

      expect(outcomes).toHaveLength(1);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('should skip a report it already filed for the same rule in the last hour', async () => {
      arrangeStory('crypto giveaway inside');
      db.select.mockReturnValueOnce(makeChain([{ id: 'report-existing' }]));

      const outcomes = await service.reviewStory(TARGET_ID);

      expect(outcomes[0]).toMatchObject({ filed: false, reason: 'duplicate' });
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should read the story from the stories table only', async () => {
      const selectChain = makeChain([
        { id: TARGET_ID, authorId: AUTHOR_ID, title: 'Clean', excerpt: null, content: null },
      ]);
      db.select.mockReturnValueOnce(selectChain);

      await service.reviewStory(TARGET_ID);

      expect(selectChain.from).toHaveBeenCalledWith(stories);
    });
  });

  describe('reviewComment', () => {
    function arrangeComment(text: string): void {
      db.select.mockReturnValueOnce(makeChain([{ id: TARGET_ID, authorId: AUTHOR_ID, content: text }]));
    }

    it('should do nothing for a clean comment', async () => {
      arrangeComment('A genuinely good read');

      await expect(service.reviewComment(TARGET_ID)).resolves.toEqual([]);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should do nothing when the comment row is gone', async () => {
      db.select.mockReturnValueOnce(makeChain([]));

      await expect(service.reviewComment(TARGET_ID)).resolves.toEqual([]);
    });

    it('should apply the comment only rules', async () => {
      arrangeComment(' ! ');
      db.select.mockReturnValueOnce(makeChain([]));
      const insertChain = makeChain([reportRow()]);
      db.insert.mockReturnValueOnce(insertChain);

      const outcomes = await service.reviewComment(TARGET_ID);

      expect(outcomes[0]?.violation.ruleId).toBe('comment-minimum-length');
      expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'comment' }));
    });

    it('should read the comment from the comments table only', async () => {
      const selectChain = makeChain([{ id: TARGET_ID, authorId: AUTHOR_ID, content: 'Nice story' }]);
      db.select.mockReturnValueOnce(selectChain);

      await service.reviewComment(TARGET_ID);

      expect(selectChain.from).toHaveBeenCalledWith(comments);
    });

    it('should file one report per tripped rule', async () => {
      arrangeComment('free money https://a.test https://b.test');
      db.select.mockReturnValueOnce(makeChain([]));
      db.select.mockReturnValueOnce(makeChain([openReport()]));
      db.insert.mockReturnValue(makeChain([reportRow()]));
      db.select.mockReturnValueOnce(makeChain([]));
      db.select.mockReturnValueOnce(makeChain([openReport({ id: 'report-2' })]));
      db.update.mockReturnValue(makeChain([{ id: 'report-1' }, { id: 'report-2' }]));

      const outcomes = await service.reviewComment(TARGET_ID);

      expect(outcomes.map((entry) => entry.violation.ruleId)).toEqual(['prohibited-terms', 'link-spam']);
      expect(db.insert).toHaveBeenCalledTimes(2);
    });
  });
});
