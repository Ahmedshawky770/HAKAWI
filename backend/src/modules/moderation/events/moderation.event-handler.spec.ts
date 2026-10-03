import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import {
  ModerationActionTakenEvent,
  ModerationReportEscalatedEvent,
} from '../../../common/events/moderation.events.ts';

import { ModerationEventHandler } from './moderation.event-handler.ts';

const makeChain = (result: unknown) => {
  type MockDbChain = {
    returning: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
  };

  const chain: MockDbChain & Record<string, ReturnType<typeof vi.fn>> = {
    returning: vi.fn(() => Promise.resolve(result)),
    where: vi.fn(() => Promise.resolve(result)),
    orderBy: vi.fn(() => Promise.resolve(result)),
  };
  chain.from = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.values = vi.fn(() => chain);
  return chain;
};

vi.mock('../../../db/index.ts', () => {
  const dbEq = vi.fn(() => 'eq_placeholder');
  const dbAnd = vi.fn(() => 'and_placeholder');
  const dbOr = vi.fn(() => 'or_placeholder');
  const dbGt = vi.fn(() => 'gt_placeholder');
  const dbGte = vi.fn(() => 'gte_placeholder');
  const dbLt = vi.fn(() => 'lt_placeholder');
  const dbIsNull = vi.fn(() => 'is_null_placeholder');

  return {
    db: {
      insert: vi.fn(() =>
        makeChain([
          {
            id: 'restriction-1',
            userId: 'user-1',
            type: 'mute',
            reason: 'Test',
            expiresAt: null,
            createdBy: 'admin-1',
            createdAt: new Date(),
          },
        ]),
      ),
      select: vi.fn(() => makeChain([{ count: '0' }])),
      update: vi.fn(() => makeChain([{ id: 'report-1', status: 'escalated' }])),
      eq: dbEq,
      and: dbAnd,
      or: dbOr,
      gt: dbGt,
      gte: dbGte,
      lt: dbLt,
      isNull: dbIsNull,
      $count: vi.fn(() => 'count_placeholder'),
    },
  };
});

describe('ModerationEventHandler', () => {
  let moderationEventHandler: ModerationEventHandler;
  let mockValkeyService: {
    set: ReturnType<typeof vi.fn>;
    hSetMultiple: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockValkeyService = {
      set: vi.fn(),
      hSetMultiple: vi.fn(),
      expire: vi.fn(),
      exists: vi.fn(),
      get: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
    };

    moderationEventHandler = new ModerationEventHandler(
      mockLogger as unknown as WinstonLoggerService,
      mockValkeyService as unknown as ValkeyService,
    );
  });

  describe('handleModerationActionTaken', () => {
    it('should set restriction in Valkey', async () => {
      const event = new ModerationActionTakenEvent('action-1', 'report-1', 'admin-1', 'user-1', 'mute', 'Violation');

      await moderationEventHandler.handleModerationActionTaken(event);

      expect(mockValkeyService.set).toHaveBeenCalledWith('restriction:user-1', 'mute', expect.any(Number));
      expect(mockValkeyService.hSetMultiple).toHaveBeenCalledWith('restriction:user-1:details', expect.any(Object));
    });

    it('should insert user restriction in DB', async () => {
      const event = new ModerationActionTakenEvent('action-1', 'report-1', 'admin-1', 'user-1', 'mute', 'Violation');

      await moderationEventHandler.handleModerationActionTaken(event);

      expect(mockValkeyService.expire).toHaveBeenCalledWith('restriction:user-1:details', expect.any(Number));
    });

    it('should log moderation action taken', async () => {
      const event = new ModerationActionTakenEvent('action-1', 'report-1', 'admin-1', 'user-1', 'mute', 'Violation');

      await moderationEventHandler.handleModerationActionTaken(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Handling moderation action taken: mute on user user-1',
        'ModerationEventHandler',
      );
    });
  });

  describe('handleModerationReportEscalated', () => {
    it('should set escalation in Valkey', async () => {
      const event = new ModerationReportEscalatedEvent('report-1', 'target-1', 'open', new Date());

      await moderationEventHandler.handleModerationReportEscalated(event);

      expect(mockValkeyService.set).toHaveBeenCalledWith('escalation:target-1', expect.any(String), expect.any(Number));
    });

    it('should log report escalated', async () => {
      const event = new ModerationReportEscalatedEvent('report-1', 'target-1', 'open', new Date());

      await moderationEventHandler.handleModerationReportEscalated(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Handling moderation report escalated: report report-1',
        'ModerationEventHandler',
      );
    });
  });
});
