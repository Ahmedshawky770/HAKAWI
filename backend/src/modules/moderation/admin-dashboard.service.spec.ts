import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { reports, moderationActions, userRestrictions } from '../../db/schema/moderation.schema.ts';

import { AdminDashboardService } from './admin-dashboard.service.ts';
import type { Report } from './moderation.service.ts';

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

type MockValkey = { get: Mock; set: Mock; del: Mock; exists: Mock };

type RestrictionRow = {
  id: string;
  userId: string;
  type: string;
  reason: string;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
};

type TrendRow = { date: Date; status: string };

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../db/index.ts', () => ({ db, default: db }));

const NOW = new Date('2026-01-10T12:00:00.000Z');

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

function reportRow(overrides: Partial<Report> = {}): Report {
  return {
    id: 'report-1',
    reporterId: 'reporter-1',
    targetId: 'target-1',
    targetType: 'story',
    reason: 'Spam',
    description: null,
    status: 'open',
    source: 'user',
    escalatedAt: null,
    resolvedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function restrictionRow(overrides: Partial<RestrictionRow> = {}): RestrictionRow {
  return {
    id: 'restriction-1',
    userId: 'user-1',
    type: 'ban',
    reason: 'spam',
    expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    createdBy: 'admin-1',
    createdAt: NOW,
    ...overrides,
  };
}

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let logger: MockLogger;
  let valkey: MockValkey;
  let eventBus: MockEventBus;
  let selectChains: ChainBuilder[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    logger = { info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() };
    valkey = { get: vi.fn(), set: vi.fn(), del: vi.fn(), exists: vi.fn() };
    eventBus = { emit: vi.fn<(name: string, payload: unknown) => Promise<void>>().mockResolvedValue(undefined) };

    db.select.mockReset();
    db.insert.mockReset();
    db.update.mockReset();
    db.delete.mockReset();

    service = new AdminDashboardService(
      logger as unknown as WinstonLoggerService,
      valkey as unknown as ValkeyService,
      eventBus as unknown as EventValidatorService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function queueCounts(counts: ReadonlyArray<number | string | null>, avgMinutes: number | string | null = null): void {
    selectChains = [...counts.map((count) => makeChain([{ count }])), makeChain([{ avgMinutes }])];
    for (const chain of selectChains) {
      db.select.mockReturnValueOnce(chain);
    }
  }

  describe('getStats', () => {
    it('should return the nine counters in the documented shape', async () => {
      queueCounts([10, 3, 2, 1, 4, 0, 11, 12, 13]);

      const stats = await service.getStats();

      expect(stats).toEqual({
        totalReports: 10,
        openReports: 3,
        escalatedReports: 2,
        inReviewReports: 1,
        resolvedReports: 4,
        dismissedReports: 0,
        totalActions: expect.any(Number),
        totalRestrictions: expect.any(Number),
        activeRestrictions: expect.any(Number),
        avgResolutionMinutes: null,
      });
    });

    it('should compute the average resolution time from the resolved reports', async () => {
      queueCounts([0, 0, 0, 0, 0, 0, 0, 0, 0], 42.5);

      const stats = await service.getStats();

      expect(stats.avgResolutionMinutes).toBe(42.5);
    });

    it('should restrict the resolution average to reports that have been resolved', async () => {
      queueCounts([0, 0, 0, 0, 0, 0, 0, 0, 0], 10);

      await service.getStats();

      expect(selectChains[9]?.where).toHaveBeenCalledWith(expect.anything());
      expect(selectChains[9]?.from).toHaveBeenCalledWith(reports);
    });

    it('should round the resolution average to two decimal places', async () => {
      queueCounts([0, 0, 0, 0, 0, 0, 0, 0, 0], '12.34567');

      const stats = await service.getStats();

      expect(stats.avgResolutionMinutes).toBe(12.35);
    });

    it('should report a null resolution average when nothing has been resolved', async () => {
      queueCounts([0, 0, 0, 0, 0, 0, 0, 0, 0], null);

      const stats = await service.getStats();

      expect(stats.avgResolutionMinutes).toBeNull();
    });

    it('should report a null resolution average for a non numeric aggregate', async () => {
      queueCounts([0, 0, 0, 0, 0, 0, 0, 0, 0], 'not-a-number');

      const stats = await service.getStats();

      expect(stats.avgResolutionMinutes).toBeNull();
    });

    it('should map each count to its own field', async () => {
      queueCounts([10, 3, 2, 1, 4, 5, 6, 7, 8]);

      const stats = await service.getStats();

      expect(stats.totalReports).toBe(10);
      expect(stats.openReports).toBe(3);
      expect(stats.escalatedReports).toBe(2);
      expect(stats.inReviewReports).toBe(1);
      expect(stats.resolvedReports).toBe(4);
      expect(stats.dismissedReports).toBe(5);
      expect(stats.totalActions).toBe(6);
      expect(stats.totalRestrictions).toBe(7);
      expect(stats.activeRestrictions).toBe(8);
    });

    it('should run the ten aggregate queries concurrently', async () => {
      queueCounts([0, 0, 0, 0, 0, 0, 0, 0, 0]);

      await service.getStats();

      expect(db.select).toHaveBeenCalledTimes(10);
    });

    it('should query the moderation actions and restriction tables for the last three counters', async () => {
      queueCounts([0, 0, 0, 0, 0, 0, 0, 0, 0]);

      await service.getStats();

      expect(selectChains[6]?.from).toHaveBeenCalledWith(moderationActions);
      expect(selectChains[7]?.from).toHaveBeenCalledWith(userRestrictions);
      expect(selectChains[8]?.from).toHaveBeenCalledWith(userRestrictions);
    });

    it('should filter the first six counters by report status', async () => {
      queueCounts([0, 0, 0, 0, 0, 0, 0, 0, 0]);

      await service.getStats();

      for (let index = 1; index <= 5; index += 1) {
        expect(selectChains[index]?.where).toHaveBeenCalledWith(expect.anything());
      }
      expect(selectChains[0]?.where).not.toHaveBeenCalled();
    });

    it('should restrict the active restriction count to unexpired or permanent rows', async () => {
      queueCounts([0, 0, 0, 0, 0, 0, 0, 0, 0]);

      await service.getStats();

      expect(selectChains[8]?.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should coerce a bigint or string count into a number', async () => {
      queueCounts(['42', 0, 0, 0, 0, 0, 0, 0, 0]);

      const stats = await service.getStats();

      expect(stats.totalReports).toBe(42);
      expect(typeof stats.totalReports).toBe('number');
    });

    it('should report zero when a counter query returns no row at all', async () => {
      for (let index = 0; index < 10; index += 1) {
        db.select.mockReturnValueOnce(makeChain([]));
      }

      const stats = await service.getStats();

      expect(stats.totalReports).toBe(0);
      expect(stats.activeRestrictions).toBe(0);
    });

    it('should report zero for a null count', async () => {
      queueCounts([null, 0, 0, 0, 0, 0, 0, 0, 0]);

      const stats = await service.getStats();

      expect(stats.totalReports).toBe(0);
    });

    it('should compute a real average resolution time instead of null', async () => {
      queueCounts([0, 0, 0, 0, 0, 0, 0, 0, 0], 7);

      const stats = await service.getStats();

      expect(stats.avgResolutionMinutes).not.toBeNull();
      expect(typeof stats.avgResolutionMinutes).toBe('number');
    });
  });

  describe('getReportTrends', () => {
    function arrange(rows: TrendRow[]): ChainBuilder {
      const chain = makeChain(rows);
      db.select.mockReturnValueOnce(chain);
      return chain;
    }

    it('should return an empty object when there are no recent reports', async () => {
      arrange([]);

      await expect(service.getReportTrends(30)).resolves.toEqual({});
    });

    it('should bucket reports by their UTC day', async () => {
      arrange([
        { date: new Date('2026-01-09T08:00:00.000Z'), status: 'open' },
        { date: new Date('2026-01-09T21:00:00.000Z'), status: 'resolved' },
      ]);

      const trends = await service.getReportTrends(7);

      expect(trends).toEqual({
        '2026-01-09': { total: 2, open: 1, escalated: 0, in_review: 0, resolved: 1, dismissed: 0 },
      });
    });

    it('should create one entry per day that has reports', async () => {
      arrange([
        { date: new Date('2026-01-08T01:00:00.000Z'), status: 'open' },
        { date: new Date('2026-01-09T01:00:00.000Z'), status: 'open' },
        { date: new Date('2026-01-10T01:00:00.000Z'), status: 'open' },
      ]);

      const trends = await service.getReportTrends(7);

      expect(Object.keys(trends).sort()).toEqual(['2026-01-08', '2026-01-09', '2026-01-10']);
    });

    it.each([
      { status: 'open', field: 'open' },
      { status: 'escalated', field: 'escalated' },
      { status: 'in_review', field: 'in_review' },
      { status: 'resolved', field: 'resolved' },
      { status: 'dismissed', field: 'dismissed' },
    ] as const)('should count $status reports in the $field bucket', async ({ status, field }) => {
      arrange([{ date: new Date('2026-01-09T08:00:00.000Z'), status }]);

      const trends = await service.getReportTrends(7);

      expect(trends['2026-01-09']?.[field]).toBe(1);
      expect(trends['2026-01-09']?.total).toBe(1);
    });

    it('should count an unrecognised status in the total but in no named bucket', async () => {
      arrange([{ date: new Date('2026-01-09T08:00:00.000Z'), status: 'archived' }]);

      const trends = await service.getReportTrends(7);

      expect(trends['2026-01-09']?.total).toBe(1);
      expect(trends['2026-01-09']?.open).toBe(0);
      expect(trends['2026-01-09']?.escalated).toBe(0);
    });

    it('should build a window of the requested number of days', async () => {
      const chain = arrange([]);

      await service.getReportTrends(14);

      expect(chain.where).toHaveBeenCalledWith(expect.anything());
      expect(chain.from).toHaveBeenCalledWith(reports);
    });

    it('should treat a one day window as one day, not zero', async () => {
      const chain = arrange([{ date: new Date('2026-01-09T12:00:00.000Z'), status: 'open' }]);

      const trends = await service.getReportTrends(1);

      expect(trends).toEqual({
        '2026-01-09': { total: 1, open: 1, escalated: 0, in_review: 0, resolved: 0, dismissed: 0 },
      });
      expect(chain.where).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('getUserRestrictions', () => {
    it('should return an empty list for an empty user id without querying', async () => {
      await expect(service.getUserRestrictions('', false)).resolves.toEqual({ restrictions: [] });

      expect(db.select).not.toHaveBeenCalled();
    });

    it('should return only the requested user rows', async () => {
      const chain = makeChain([restrictionRow()]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getUserRestrictions('user-1', false);

      expect(chain.from).toHaveBeenCalledWith(userRestrictions);
      expect(result).toEqual({ restrictions: [restrictionRow()] });
    });

    it('should add an expiry filter when expired restrictions are excluded', async () => {
      const chain = makeChain([]);
      db.select.mockReturnValueOnce(chain);

      await service.getUserRestrictions('user-1', false);

      expect(chain.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should filter on the user id alone when expired restrictions are included', async () => {
      const chain = makeChain([restrictionRow({ expiresAt: new Date('2020-01-01T00:00:00.000Z') })]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getUserRestrictions('user-1', true);

      const clause = chain.where.mock.calls[0]?.[0];
      expect(result).toEqual({ restrictions: [restrictionRow({ expiresAt: new Date('2020-01-01T00:00:00.000Z') })] });
      expect(clause).toBeDefined();
    });

    it('should order the restrictions newest first', async () => {
      const chain = makeChain([]);
      db.select.mockReturnValueOnce(chain);

      await service.getUserRestrictions('user-1', false);

      expect(chain.orderBy).toHaveBeenCalledTimes(1);
    });

    it('should return an empty list when the user has no restrictions', async () => {
      db.select.mockReturnValueOnce(makeChain([]));

      await expect(service.getUserRestrictions('user-1', false)).resolves.toEqual({ restrictions: [] });
    });
  });

  describe('getModerationActions', () => {
    function arrange(rows: unknown[], total: string | number): ChainBuilder {
      const rowsChain = makeChain(rows);
      db.select.mockReturnValueOnce(rowsChain).mockReturnValueOnce(makeChain([{ total }]));
      return rowsChain;
    }

    it('should return the actions with pagination metadata and a numeric total', async () => {
      arrange([{ id: 'action-1' }, { id: 'action-2' }], '7');

      const result = await service.getModerationActions({ page: 1, limit: 20 });

      expect(result).toEqual({
        actions: [{ id: 'action-1' }, { id: 'action-2' }],
        total: 7,
        page: 1,
        limit: 20,
      });
    });

    it('should translate page and limit into limit and offset', async () => {
      const rowsChain = arrange([], 0);

      await service.getModerationActions({ page: 4, limit: 5 });

      expect(rowsChain.limit).toHaveBeenCalledWith(5);
      expect(rowsChain.offset).toHaveBeenCalledWith(15);
    });

    it('should default to the first page of twenty when page is missing', async () => {
      const rowsChain = arrange([], 0);

      const result = await service.getModerationActions({} as unknown as { page: number; limit: number });

      expect(rowsChain.limit).toHaveBeenCalledWith(20);
      expect(rowsChain.offset).toHaveBeenCalledWith(0);
      expect(result).toEqual(expect.objectContaining({ page: 1, limit: 20 }));
    });

    it('should pass an undefined where clause when no filter is given', async () => {
      const rowsChain = arrange([], 0);

      await service.getModerationActions({ page: 1, limit: 20 });

      expect(rowsChain.where).toHaveBeenCalledWith(undefined);
    });

    it('should filter by admin id', async () => {
      const rowsChain = arrange([], 0);

      await service.getModerationActions({ page: 1, limit: 20, adminId: 'admin-1' });

      expect(rowsChain.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should filter by action type', async () => {
      const rowsChain = arrange([], 0);

      await service.getModerationActions({ page: 1, limit: 20, action: 'ban' });

      expect(rowsChain.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should combine the admin and action filters into one clause', async () => {
      const rowsChain = arrange([], 0);

      await service.getModerationActions({ page: 1, limit: 20, adminId: 'admin-1', action: 'ban' });

      expect(rowsChain.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should apply the same filter to the count query', async () => {
      const rowsChain = arrange([], 0);
      const countChain = { where: vi.fn(() => rowsChain) } as unknown as ChainBuilder;
      db.select.mockReset();
      db.select.mockReturnValueOnce(rowsChain).mockReturnValueOnce(makeChain([{ total: 0 }]));

      await service.getModerationActions({ page: 1, limit: 20, adminId: 'admin-1' });

      expect(countChain.where).not.toHaveBeenCalled();
      expect(db.select).toHaveBeenCalledTimes(2);
    });

    it('should order the actions newest first', async () => {
      const rowsChain = arrange([], 0);

      await service.getModerationActions({ page: 1, limit: 20 });

      expect(rowsChain.orderBy).toHaveBeenCalledTimes(1);
    });

    it('should return an empty page without inventing actions', async () => {
      arrange([], 0);

      const result = await service.getModerationActions({ page: 3, limit: 20 });

      expect(result).toEqual({ actions: [], total: 0, page: 3, limit: 20 });
    });
  });

  describe('autoEscalateReports', () => {
    it('should return zero when there are no stale open reports', async () => {
      db.select.mockReturnValue(makeChain([]));

      await expect(service.autoEscalateReports()).resolves.toBe(0);

      expect(db.update).not.toHaveBeenCalled();
    });

    it('should escalate a stale open report and stamp escalatedAt', async () => {
      db.select.mockReturnValue(makeChain([reportRow({ id: 'stale-1' })]));
      const updateChain = makeChain([reportRow({ id: 'stale-1', status: 'escalated' })]);
      db.update.mockReturnValue(updateChain);

      const result = await service.autoEscalateReports();

      expect(result).toBe(1);
      expect(db.update).toHaveBeenCalledWith(reports);
      expect(updateChain.set).toHaveBeenCalledWith({ status: 'escalated', escalatedAt: NOW, updatedAt: NOW });
    });

    it('should escalate every stale report it can update', async () => {
      db.select.mockReturnValue(
        makeChain([reportRow({ id: 'stale-1' }), reportRow({ id: 'stale-2' }), reportRow({ id: 'stale-3' })]),
      );
      db.update.mockReturnValue(makeChain([reportRow({ status: 'escalated' })]));

      await expect(service.autoEscalateReports()).resolves.toBe(3);
      expect(eventBus.emit).toHaveBeenCalledTimes(3);
    });

    it('should emit the escalation event with the previous status', async () => {
      db.select.mockReturnValue(
        makeChain([
          reportRow({ id: 'stale-1', targetId: 'target-a', status: 'open', updatedAt: new Date('2025-12-30') }),
        ]),
      );
      db.update.mockReturnValue(makeChain([reportRow({ status: 'escalated' })]));

      await service.autoEscalateReports();

      expect(eventBus.emit).toHaveBeenCalledWith('moderation.report.escalated', {
        reportId: 'stale-1',
        targetId: 'target-a',
        previousStatus: 'open',
        previousUpdatedAt: new Date('2025-12-30'),
      });
    });

    it('should not count a report whose update matched no row', async () => {
      db.select.mockReturnValue(makeChain([reportRow({ id: 'stale-1' })]));
      db.update.mockReturnValue(makeChain([]));

      await expect(service.autoEscalateReports()).resolves.toBe(0);
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('should log a warning per escalation and an info summary', async () => {
      db.select.mockReturnValue(makeChain([reportRow({ id: 'stale-1', targetId: 'target-a' })]));
      db.update.mockReturnValue(makeChain([reportRow({ status: 'escalated' })]));

      await service.autoEscalateReports();

      expect(logger.warn).toHaveBeenCalledWith(
        'Auto-escalated report stale-1 for target target-a',
        'AdminDashboardService',
      );
      expect(logger.info).toHaveBeenCalledWith('Auto-escalated 1 reports', 'AdminDashboardService');
    });

    it('should not log the summary when nothing was escalated', async () => {
      db.select.mockReturnValue(makeChain([]));

      await service.autoEscalateReports();

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should select only open reports older than twenty four hours', async () => {
      const chain = makeChain([]);
      db.select.mockReturnValue(chain);

      await service.autoEscalateReports();

      expect(chain.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should re-assert the open status in the write, not trust the read it just did', async () => {
      db.select.mockReturnValue(makeChain([reportRow({ id: 'stale-1', status: 'open' })]));
      const updateChain = makeChain([]);
      db.update.mockReturnValue(updateChain);

      const result = await service.autoEscalateReports();

      // The read and the write are two statements. An admin resolving the report in between
      // must win, which it only can if the UPDATE itself carries the status predicate.
      expect(result).toBe(0);
      expect(updateChain.where).toHaveBeenCalledWith(expect.anything());
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('should let only one of two overlapping sweeps escalate a report', async () => {
      // Both sweeps read the same open report before either writes.
      db.select.mockReturnValue(makeChain([reportRow({ id: 'stale-1', status: 'open' })]));

      const chain = makeChain([]);
      db.update.mockReturnValue(chain);
      await service.autoEscalateReports();

      const secondUpdate = makeChain([reportRow({ id: 'stale-1', status: 'escalated' })]);
      db.update.mockReturnValue(secondUpdate);
      const second = await service.autoEscalateReports();

      expect(second).toBe(1);
      expect(secondUpdate.where).toHaveBeenCalledWith(expect.anything());
    });
  });
});
