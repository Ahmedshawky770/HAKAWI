import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../common/services/valkey.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { reports, moderationActions, userRestrictions } from '../../db/schema/moderation.schema.ts';

import { ModerationService, type Report, type ModerationAction } from './moderation.service.ts';
import type { CreateReportDto, ModerationActionDto, ReportQueryDto } from './dto/report.dto.ts';

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

type MockValkey = {
  get: Mock;
  set: Mock;
  del: Mock;
  exists: Mock;
};

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../db/index.ts', () => ({ db, default: db }));

const NOW = new Date('2026-01-01T00:00:00.000Z');

const TARGET_USER_ID = '9b1d4f7a-1c2e-4f5b-8a9d-0e1f2a3b4c5d';

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

function actionRow(overrides: Partial<ModerationAction> = {}): ModerationAction {
  return {
    id: 'action-1',
    reportId: 'report-1',
    adminId: 'admin-1',
    action: 'warn',
    reason: 'First warning',
    durationMinutes: null,
    targetUserId: null,
    createdAt: NOW,
    ...overrides,
  };
}

function createDto(overrides: Partial<CreateReportDto> = {}): CreateReportDto {
  return {
    targetId: '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
    targetType: 'story',
    reason: 'Spam',
    ...overrides,
  };
}

function actionDto(overrides: Partial<ModerationActionDto> = {}): ModerationActionDto {
  return { action: 'warn', reason: 'First warning', ...overrides };
}

function query(overrides: Partial<ReportQueryDto> = {}): ReportQueryDto {
  return { page: 1, limit: 20, ...overrides };
}

describe('ModerationService', () => {
  let service: ModerationService;
  let logger: MockLogger;
  let valkey: MockValkey;
  let eventBus: MockEventBus;

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

    db.select.mockReturnValue(makeChain([{ total: 0 }]));

    service = new ModerationService(
      logger as unknown as WinstonLoggerService,
      valkey as unknown as ValkeyService,
      eventBus as unknown as EventValidatorService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createReport', () => {
    it('should insert an open report and return the stored row', async () => {
      db.insert.mockReturnValue(makeChain([reportRow()]));

      const result = await service.createReport('reporter-1', createDto());

      expect(result.id).toBe('report-1');
      expect(result.status).toBe('open');
      expect(result.reporterId).toBe('reporter-1');
    });

    it('should force the initial status to open regardless of the payload', async () => {
      const chain = makeChain([reportRow()]);
      db.insert.mockReturnValue(chain);

      await service.createReport('reporter-1', createDto());

      expect(db.insert).toHaveBeenCalledWith(reports);
      expect(chain.values).toHaveBeenCalledWith({
        reporterId: 'reporter-1',
        targetId: '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
        targetType: 'story',
        reason: 'Spam',
        description: null,
        status: 'open',
      });
      expect(chain.returning).toHaveBeenCalledTimes(1);
    });

    it.each([
      { label: 'an omitted description', dto: {} },
      { label: 'an empty description', dto: { description: '' } },
    ])('should normalise $label to null', async ({ dto }) => {
      const chain = makeChain([reportRow()]);
      db.insert.mockReturnValue(chain);

      await service.createReport('reporter-1', createDto(dto));

      expect(chain.values).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
    });

    it('should keep a supplied description', async () => {
      const chain = makeChain([reportRow({ description: 'links to a scam' })]);
      db.insert.mockReturnValue(chain);

      const result = await service.createReport('reporter-1', createDto({ description: 'links to a scam' }));

      expect(chain.values).toHaveBeenCalledWith(expect.objectContaining({ description: 'links to a scam' }));
      expect(result.description).toBe('links to a scam');
    });

    it('should log the report creation with the target type and id', async () => {
      db.insert.mockReturnValue(makeChain([reportRow()]));

      await service.createReport('reporter-1', createDto());

      expect(logger.info).toHaveBeenCalledWith(
        'Creating report by reporter-1 for story 3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
        'ModerationService',
      );
    });

    it('should let a database failure propagate to the caller', async () => {
      db.insert.mockImplementation(() => {
        throw new Error('connection terminated');
      });

      await expect(service.createReport('reporter-1', createDto())).rejects.toThrow('connection terminated');
    });

    it('should announce the report on the event bus', async () => {
      db.insert.mockReturnValue(makeChain([reportRow()]));

      await service.createReport('reporter-1', createDto());

      expect(eventBus.emit).toHaveBeenCalledWith('moderation.report.created', {
        reportId: 'report-1',
        reporterId: 'reporter-1',
        targetId: '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
        targetType: 'story',
        reason: 'Spam',
      });
    });

    it('should run the auto-escalation check for the new report', async () => {
      db.insert.mockReturnValue(makeChain([reportRow()]));
      const countChain = makeChain([{ total: 3 }]);
      db.select.mockReturnValueOnce(countChain);
      db.select.mockReturnValueOnce(makeChain([{ id: 'report-1', status: 'open', updatedAt: NOW }]));
      const updateChain = makeChain([{ id: 'report-1' }]);
      db.update.mockReturnValue(updateChain);

      await service.createReport('reporter-1', createDto());

      expect(countChain.where).toHaveBeenCalledWith(expect.anything());
      expect(db.update).toHaveBeenCalledWith(reports);
      expect(updateChain.set).toHaveBeenCalledWith({
        escalatedAt: NOW,
        status: 'in_review',
        updatedAt: NOW,
      });
    });

    it('should not escalate a first report against a quiet target', async () => {
      db.insert.mockReturnValue(makeChain([reportRow()]));
      const countChain = makeChain([{ total: 1 }]);
      db.select.mockReturnValueOnce(countChain);

      await service.createReport('reporter-1', createDto());

      expect(db.update).not.toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith('moderation.report.created', expect.anything());
    });

    it.each([
      { label: 'a non uuid target id', dto: { targetId: 'target-1' } },
      { label: 'an unknown target type', dto: { targetType: 'book' } },
      { label: 'an empty reason', dto: { reason: '' } },
      { label: 'a reason over five hundred characters', dto: { reason: 'x'.repeat(501) } },
    ] as ReadonlyArray<{ label: string; dto: Partial<CreateReportDto> }>)(
      'should reject $label with 400 before touching the database',
      async ({ dto }) => {
        await expect(service.createReport('reporter-1', createDto(dto))).rejects.toThrow(BadRequestException);

        expect(db.insert).not.toHaveBeenCalled();
      },
    );
  });

  describe('findAllReports', () => {
    function arrange(rows: Report[], total: string | number): ChainBuilder {
      const rowsChain = makeChain(rows);
      const countChain = makeChain([{ total }]);
      db.select.mockReturnValueOnce(rowsChain).mockReturnValueOnce(countChain);
      return rowsChain;
    }

    it('should default to the first page of twenty', async () => {
      const rowsChain = arrange([reportRow()], 1);

      await service.findAllReports(query());

      expect(rowsChain.limit).toHaveBeenCalledWith(20);
      expect(rowsChain.offset).toHaveBeenCalledWith(0);
    });

    it('should translate page and limit into an offset', async () => {
      const rowsChain = arrange([], 0);

      await service.findAllReports(query({ page: 3, limit: 10 }));

      expect(rowsChain.limit).toHaveBeenCalledWith(10);
      expect(rowsChain.offset).toHaveBeenCalledWith(20);
    });

    it('should return the rows and the total', async () => {
      arrange([reportRow(), reportRow({ id: 'report-2' })], 2);

      const result = await service.findAllReports(query());

      expect(result.total).toBe(2);
      expect(result.reports.map((row) => row.id)).toEqual(['report-1', 'report-2']);
    });

    it('should coerce a bigint or string count into a number', async () => {
      arrange([], '128');

      const result = await service.findAllReports(query());

      expect(result.total).toBe(128);
      expect(typeof result.total).toBe('number');
    });

    it('should return an empty page without inventing rows', async () => {
      arrange([], 0);

      const result = await service.findAllReports(query({ page: 9, limit: 5 }));

      expect(result.reports).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should report the page and limit it read rather than dropping them', async () => {
      arrange([], 12);

      const result = await service.findAllReports(query({ page: 3, limit: 5 }));

      expect(result.page).toBe(3);
      expect(result.limit).toBe(5);
    });

    it('should report the default window when the caller asked for none', async () => {
      arrange([], 0);

      const result = await service.findAllReports(query());

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should surface the source column the new migration added', async () => {
      arrange([reportRow({ source: 'auto', reporterId: null })], 1);

      const result = await service.findAllReports(query());

      expect(result.reports[0]?.source).toBe('auto');
      expect(result.reports[0]?.reporterId).toBeNull();
    });

    it('should pass an undefined where clause when no filter is given', async () => {
      const rowsChain = arrange([], 0);

      await service.findAllReports(query());

      expect(rowsChain.where).toHaveBeenCalledWith(undefined);
    });

    it('should add an escalation filter for a status the API can actually set', async () => {
      const rowsChain = arrange([], 0);

      await service.findAllReports(query({ status: 'in_review' }));

      expect(rowsChain.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should add a target type filter', async () => {
      const rowsChain = arrange([], 0);

      await service.findAllReports(query({ targetType: 'user' }));

      expect(rowsChain.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should combine both filters into one clause', async () => {
      const rowsChain = arrange([], 0);

      await service.findAllReports(query({ status: 'open', targetType: 'comment' }));

      expect(rowsChain.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should order by creation date descending', async () => {
      const rowsChain = arrange([], 0);

      await service.findAllReports(query());

      expect(rowsChain.orderBy).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateReportStatus', () => {
    it('should stamp resolvedAt when the status becomes resolved', async () => {
      const chain = makeChain([reportRow({ status: 'resolved', resolvedAt: NOW })]);
      db.update.mockReturnValue(chain);

      const result = await service.updateReportStatus('report-1', { status: 'resolved' });

      expect(chain.set).toHaveBeenCalledWith({
        status: 'resolved',
        resolvedAt: NOW,
        updatedAt: NOW,
      });
      expect(result.status).toBe('resolved');
    });

    it.each([{ status: 'open' as const }, { status: 'in_review' as const }, { status: 'dismissed' as const }])(
      'should clear resolvedAt for the $status status',
      async ({ status }) => {
        const chain = makeChain([reportRow({ status })]);
        db.update.mockReturnValue(chain);

        await service.updateReportStatus('report-1', { status });

        expect(chain.set).toHaveBeenCalledWith({ status, resolvedAt: null, updatedAt: NOW });
      },
    );

    it('should update the reports table by primary key', async () => {
      const chain = makeChain([reportRow()]);
      db.update.mockReturnValue(chain);

      await service.updateReportStatus('report-1', { status: 'resolved' });

      expect(db.update).toHaveBeenCalledWith(reports);
      expect(chain.where).toHaveBeenCalledTimes(1);
      expect(chain.returning).toHaveBeenCalledTimes(1);
    });

    it('should reject a status update for a report that does not exist', async () => {
      const chain = makeChain([]);
      db.update.mockReturnValue(chain);

      await expect(service.updateReportStatus('missing-report', { status: 'resolved' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('takeAction', () => {
    it('should record the action and return it', async () => {
      const actionChain = makeChain([actionRow()]);
      db.insert.mockReturnValueOnce(actionChain).mockReturnValueOnce(makeChain(undefined));

      const result = await service.takeAction('report-1', 'admin-1', actionDto());

      expect(db.insert).toHaveBeenNthCalledWith(1, moderationActions);
      expect(result.id).toBe('action-1');
      expect(result.action).toBe('warn');
    });

    it('should normalise absent targetUserId and durationMinutes to null', async () => {
      const actionChain = makeChain([actionRow()]);
      db.insert.mockReturnValueOnce(actionChain).mockReturnValueOnce(makeChain(undefined));

      await service.takeAction('report-1', 'admin-1', actionDto());

      expect(actionChain.values).toHaveBeenCalledWith({
        reportId: 'report-1',
        adminId: 'admin-1',
        targetUserId: null,
        action: 'warn',
        reason: 'First warning',
        durationMinutes: null,
      });
    });

    it('should keep a supplied targetUserId and durationMinutes', async () => {
      const actionChain = makeChain([actionRow()]);
      db.insert.mockReturnValueOnce(actionChain).mockReturnValueOnce(makeChain(undefined));

      await service.takeAction(
        'report-1',
        'admin-1',
        actionDto({ action: 'mute', targetUserId: TARGET_USER_ID, durationMinutes: 60 }),
      );

      expect(actionChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ targetUserId: TARGET_USER_ID, durationMinutes: 60 }),
      );
    });

    it.each([
      { action: 'warn' as const, expectedType: 'warning' },
      { action: 'mute' as const, expectedType: 'mute' },
      { action: 'ban' as const, expectedType: 'ban' },
      { action: 'content_removal' as const, expectedType: 'warning' },
      { action: 'no_action' as const, expectedType: 'warning' },
    ])('should create a $expectedType restriction for a $action with a duration', async ({ action, expectedType }) => {
      const actionChain = makeChain([actionRow()]);
      const restrictionChain = makeChain(undefined);
      db.insert.mockReturnValueOnce(actionChain).mockReturnValueOnce(restrictionChain);

      await service.takeAction(
        'report-1',
        'admin-1',
        actionDto({ action, targetUserId: TARGET_USER_ID, durationMinutes: 45 }),
      );

      expect(db.insert).toHaveBeenNthCalledWith(2, userRestrictions);
      expect(restrictionChain.values).toHaveBeenCalledWith({
        userId: TARGET_USER_ID,
        type: expectedType,
        reason: 'First warning',
        expiresAt: new Date(NOW.getTime() + 45 * 60 * 1000),
        createdBy: 'admin-1',
      });
    });

    it('should not create a restriction when the duration is missing', async () => {
      const actionChain = makeChain([actionRow()]);
      db.insert.mockReturnValueOnce(actionChain);

      await service.takeAction('report-1', 'admin-1', actionDto({ targetUserId: TARGET_USER_ID }));

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.insert).not.toHaveBeenCalledWith(userRestrictions);
    });

    it('should not create a restriction when the target user is missing', async () => {
      const actionChain = makeChain([actionRow()]);
      db.insert.mockReturnValueOnce(actionChain);

      await service.takeAction('report-1', 'admin-1', actionDto({ durationMinutes: 60 }));

      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it('should reject a zero duration instead of silently recording no restriction', async () => {
      const actionChain = makeChain([actionRow()]);
      db.insert.mockReturnValueOnce(actionChain);

      await expect(
        service.takeAction(
          'report-1',
          'admin-1',
          actionDto({ targetUserId: TARGET_USER_ID, durationMinutes: 0 as unknown as number }),
        ),
      ).rejects.toThrow(BadRequestException);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should emit the moderation.action.taken event with the new action id', async () => {
      const actionChain = makeChain([actionRow({ id: 'action-77', targetUserId: TARGET_USER_ID })]);
      db.insert.mockReturnValueOnce(actionChain).mockReturnValueOnce(makeChain(undefined));

      await service.takeAction('report-1', 'admin-1', actionDto({ targetUserId: TARGET_USER_ID, durationMinutes: 30 }));

      expect(eventBus.emit).toHaveBeenCalledWith('moderation.action.taken', {
        actionId: 'action-77',
        reportId: 'report-1',
        adminId: 'admin-1',
        targetUserId: TARGET_USER_ID,
        action: 'warn',
        reason: 'First warning',
      });
    });

    it('should emit an empty targetUserId when the action has no target', async () => {
      const actionChain = makeChain([actionRow()]);
      db.insert.mockReturnValueOnce(actionChain);

      await service.takeAction('report-1', 'admin-1', actionDto());

      expect(eventBus.emit).toHaveBeenCalledWith(
        'moderation.action.taken',
        expect.objectContaining({ targetUserId: '' }),
      );
    });

    it('should log the action with the admin id', async () => {
      const actionChain = makeChain([actionRow()]);
      db.insert.mockReturnValueOnce(actionChain);

      await service.takeAction('report-1', 'admin-1', actionDto({ action: 'ban' }));

      expect(logger.info).toHaveBeenCalledWith(
        'Admin admin-1 taking action ban on report report-1',
        'ModerationService',
      );
    });
  });

  describe('checkAutoEscalation', () => {
    function arrangeCount(total: string | number): void {
      db.select.mockReturnValueOnce(makeChain([{ total }]));
    }

    /** The rows the escalation reads before it writes, i.e. what the audit trail can claim. */
    function arrangeOpen(rows: Array<{ id: string; status: string; updatedAt: Date }>): ChainBuilder {
      const chain = makeChain(rows);
      db.select.mockReturnValueOnce(chain);
      return chain;
    }

    it.each([0, 1, 2])('should do nothing when only %i reports exist in the window', async (total) => {
      arrangeCount(total);

      await service.checkAutoEscalation('target-1');

      expect(db.update).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('should escalate at exactly the third report in the window', async () => {
      arrangeCount(3);
      arrangeOpen([{ id: 'report-1', status: 'open', updatedAt: NOW }]);
      const updateChain = makeChain([{ id: 'report-1' }]);
      db.update.mockReturnValue(updateChain);

      await service.checkAutoEscalation('target-1');

      expect(db.update).toHaveBeenCalledWith(reports);
      expect(updateChain.set).toHaveBeenCalledWith({
        escalatedAt: new Date(),
        status: 'in_review',
        updatedAt: new Date(),
      });
    });

    it('should scope the write to the rows that are still open', async () => {
      arrangeCount(5);
      const openChain = arrangeOpen([{ id: 'report-1', status: 'open', updatedAt: NOW }]);
      const updateChain = makeChain([{ id: 'report-1' }]);
      db.update.mockReturnValue(updateChain);

      await service.checkAutoEscalation('target-1');

      expect(openChain.where).toHaveBeenCalledWith(expect.anything());
      expect(updateChain.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should log a warning naming the report count and the target', async () => {
      arrangeCount(4);
      arrangeOpen([{ id: 'report-1', status: 'open', updatedAt: NOW }]);
      db.update.mockReturnValue(makeChain([{ id: 'report-1' }]));

      await service.checkAutoEscalation('target-1');

      expect(logger.warn).toHaveBeenCalledWith('Auto-escalated 4 reports for target target-1', 'ModerationService');
    });

    it('should emit the escalation with the previous status the row really held', async () => {
      arrangeCount(3);
      arrangeOpen([{ id: 'report-1', status: 'open', updatedAt: new Date('2025-12-31T10:00:00Z') }]);
      db.update.mockReturnValue(makeChain([{ id: 'report-1' }]));

      await service.checkAutoEscalation('target-1');

      expect(eventBus.emit).toHaveBeenCalledWith('moderation.report.escalated', {
        reportId: 'report-1',
        targetId: 'target-1',
        previousStatus: 'open',
        previousUpdatedAt: new Date('2025-12-31T10:00:00Z'),
      });
    });

    it('should emit one event per row the update actually moved', async () => {
      arrangeCount(5);
      arrangeOpen([
        { id: 'report-1', status: 'open', updatedAt: new Date('2025-12-31T10:00:00Z') },
        { id: 'report-2', status: 'open', updatedAt: new Date('2025-12-30T09:00:00Z') },
        { id: 'report-3', status: 'open', updatedAt: new Date('2025-12-29T08:00:00Z') },
      ]);
      db.update.mockReturnValue(makeChain([{ id: 'report-1' }, { id: 'report-2' }, { id: 'report-3' }]));

      await service.checkAutoEscalation('target-1');

      expect(eventBus.emit).toHaveBeenCalledTimes(3);
    });

    it('should stay silent about a row the conditional update did not touch', async () => {
      arrangeCount(3);
      arrangeOpen([
        { id: 'report-1', status: 'open', updatedAt: NOW },
        { id: 'report-2', status: 'open', updatedAt: NOW },
      ]);
      db.update.mockReturnValue(makeChain([{ id: 'report-1' }]));

      await service.checkAutoEscalation('target-1');

      expect(eventBus.emit).toHaveBeenCalledTimes(1);
      expect(eventBus.emit).toHaveBeenCalledWith(
        'moderation.report.escalated',
        expect.objectContaining({ reportId: 'report-1' }),
      );
    });

    it('should not claim an escalation when every open row was resolved in the gap', async () => {
      arrangeCount(3);
      arrangeOpen([{ id: 'report-1', status: 'open', updatedAt: NOW }]);
      db.update.mockReturnValue(makeChain([]));

      await service.checkAutoEscalation('target-1');

      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('should not write at all when the target has no open report left', async () => {
      arrangeCount(3);
      arrangeOpen([]);

      await service.checkAutoEscalation('target-1');

      expect(db.update).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('should count with a one hour lookback window', async () => {
      const countChain = makeChain([{ total: 0 }]);
      db.select.mockReturnValueOnce(countChain);

      await service.checkAutoEscalation('target-1');

      expect(countChain.where).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe('autoEscalateReports', () => {
    it('should return zero and touch nothing when there are no stale open reports', async () => {
      db.select.mockReturnValue(makeChain([]));

      await expect(service.autoEscalateReports()).resolves.toBe(0);

      expect(db.update).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('should escalate a stale open report and stamp escalatedAt', async () => {
      db.select.mockReturnValue(makeChain([reportRow({ id: 'stale-1' })]));
      const updateChain = makeChain([reportRow({ id: 'stale-1', status: 'escalated' })]);
      db.update.mockReturnValue(updateChain);

      const result = await service.autoEscalateReports();

      expect(result).toBe(1);
      expect(db.update).toHaveBeenCalledWith(reports);
      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'escalated',
        escalatedAt: NOW,
        updatedAt: NOW,
      });
    });

    it('should escalate every stale report in one pass', async () => {
      db.select.mockReturnValue(
        makeChain([
          reportRow({ id: 'stale-1', targetId: 'target-a' }),
          reportRow({ id: 'stale-2', targetId: 'target-b' }),
          reportRow({ id: 'stale-3', targetId: 'target-c' }),
        ]),
      );
      db.update.mockReturnValue(makeChain([reportRow({ status: 'escalated' })]));

      const result = await service.autoEscalateReports();

      expect(result).toBe(3);
      expect(db.update).toHaveBeenCalledTimes(3);
      expect(eventBus.emit).toHaveBeenCalledTimes(3);
    });

    it('should emit one escalation event per report it actually escalated', async () => {
      db.select.mockReturnValue(
        makeChain([
          reportRow({
            id: 'stale-1',
            targetId: 'target-a',
            status: 'open',
            updatedAt: new Date('2025-12-30T00:00:00Z'),
          }),
          reportRow({
            id: 'stale-2',
            targetId: 'target-b',
            status: 'open',
            updatedAt: new Date('2025-12-29T00:00:00Z'),
          }),
        ]),
      );
      db.update.mockReturnValue(makeChain([reportRow({ status: 'escalated' })]));

      await service.autoEscalateReports();

      expect(eventBus.emit).toHaveBeenNthCalledWith(1, 'moderation.report.escalated', {
        reportId: 'stale-1',
        targetId: 'target-a',
        previousStatus: 'open',
        previousUpdatedAt: new Date('2025-12-30T00:00:00Z'),
      });
      expect(eventBus.emit).toHaveBeenNthCalledWith(2, 'moderation.report.escalated', {
        reportId: 'stale-2',
        targetId: 'target-b',
        previousStatus: 'open',
        previousUpdatedAt: new Date('2025-12-29T00:00:00Z'),
      });
    });

    it('should not count or emit a report whose update matched no row', async () => {
      db.select.mockReturnValue(makeChain([reportRow({ id: 'stale-1' })]));
      db.update.mockReturnValue(makeChain([]));

      const result = await service.autoEscalateReports();

      expect(result).toBe(0);
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('should log a warning per report and an info summary at the end', async () => {
      db.select.mockReturnValue(makeChain([reportRow({ id: 'stale-1', targetId: 'target-a' })]));
      db.update.mockReturnValue(makeChain([reportRow({ status: 'escalated' })]));

      await service.autoEscalateReports();

      expect(logger.warn).toHaveBeenCalledWith(
        'Auto-escalated report stale-1 for target target-a',
        'ModerationService',
      );
      expect(logger.info).toHaveBeenCalledWith('Auto-escalated 1 reports', 'ModerationService');
    });

    it('should not log the summary when nothing was escalated', async () => {
      db.select.mockReturnValue(makeChain([]));

      await service.autoEscalateReports();

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should select only open reports older than twenty four hours', async () => {
      const selectChain = makeChain([]);
      db.select.mockReturnValue(selectChain);

      await service.autoEscalateReports();

      expect(selectChain.where).toHaveBeenCalledWith(expect.anything());
    });

    it('should re-assert the open status in the write so a concurrent resolution wins', async () => {
      db.select.mockReturnValue(makeChain([reportRow({ id: 'stale-1', status: 'open' })]));
      const updateChain = makeChain([]);
      db.update.mockReturnValue(updateChain);

      const result = await service.autoEscalateReports();

      expect(result).toBe(0);
      expect(updateChain.where).toHaveBeenCalledWith(expect.anything());
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });
});
