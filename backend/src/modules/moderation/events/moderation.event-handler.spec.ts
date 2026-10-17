import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  ModerationActionTakenEvent,
  ModerationReportEscalatedEvent,
} from '../../../common/events/moderation.events.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { BAN_TTL_SECONDS, OTHER_RESTRICTION_TTL_SECONDS, restrictionTtlSeconds } from '../restriction-policy.ts';

import { ModerationEventHandler } from './moderation.event-handler.ts';

const SEVEN_DAYS_MINUTES = 7 * 24 * 60;

describe('ModerationEventHandler', () => {
  let moderationEventHandler: ModerationEventHandler;
  let mockValkeyService: {
    set: ReturnType<typeof vi.fn>;
    hSetMultiple: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockValkeyService = {
      set: vi.fn(),
      hSetMultiple: vi.fn(),
      expire: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
    };

    moderationEventHandler = new ModerationEventHandler(
      mockLogger as unknown as WinstonLoggerService,
      mockValkeyService as unknown as ValkeyService,
    );
  });

  describe('handleModerationActionTaken', () => {
    it('should set restriction in Valkey', async () => {
      const event = new ModerationActionTakenEvent(
        'action-1',
        'report-1',
        'admin-1',
        'user-1',
        'mute',
        'Violation',
        60,
      );

      await moderationEventHandler.handleModerationActionTaken(event);

      expect(mockValkeyService.set).toHaveBeenCalledWith('restriction:user-1', 'mute', 60 * 60);
      expect(mockValkeyService.hSetMultiple).toHaveBeenCalledWith(
        'restriction:user-1:details',
        expect.objectContaining({ type: 'mute' }),
      );
    });

    it('should expire the details hash on the same TTL as the restriction key', async () => {
      const event = new ModerationActionTakenEvent(
        'action-1',
        'report-1',
        'admin-1',
        'user-1',
        'mute',
        'Violation',
        60,
      );

      await moderationEventHandler.handleModerationActionTaken(event);

      expect(mockValkeyService.expire).toHaveBeenCalledWith('restriction:user-1:details', 60 * 60);
    });

    it('should log moderation action taken', async () => {
      const event = new ModerationActionTakenEvent(
        'action-1',
        'report-1',
        'admin-1',
        'user-1',
        'mute',
        'Violation',
        null,
      );

      await moderationEventHandler.handleModerationActionTaken(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Handling moderation action taken: mute on user user-1',
        'ModerationEventHandler',
      );
    });

    it.each([
      { label: 'a ban without a duration', action: 'ban', expectedTtl: BAN_TTL_SECONDS },
      { label: 'a mute without a duration', action: 'mute', expectedTtl: OTHER_RESTRICTION_TTL_SECONDS },
    ])('should enforce $label with the policy default TTL', async ({ action, expectedTtl }) => {
      const event = new ModerationActionTakenEvent(
        'action-1',
        'report-1',
        'admin-1',
        'user-1',
        action,
        'Violation',
        null,
      );

      await moderationEventHandler.handleModerationActionTaken(event);

      expect(mockValkeyService.set).toHaveBeenCalledWith('restriction:user-1', action, expectedTtl);
      expect(mockValkeyService.expire).toHaveBeenCalledWith('restriction:user-1:details', expectedTtl);
    });

    it('should enforce the moderator seven day ban rather than a fixed day', async () => {
      const event = new ModerationActionTakenEvent(
        'action-1',
        'report-1',
        'admin-1',
        'user-1',
        'ban',
        'Violation',
        SEVEN_DAYS_MINUTES,
      );

      await moderationEventHandler.handleModerationActionTaken(event);

      expect(mockValkeyService.set).toHaveBeenCalledWith('restriction:user-1', 'ban', SEVEN_DAYS_MINUTES * 60);
      expect(mockValkeyService.expire).toHaveBeenCalledWith('restriction:user-1:details', SEVEN_DAYS_MINUTES * 60);
    });

    it.each(['warn', 'content_removal', 'no_action'] as const)(
      'should leave the restriction cache untouched for %s',
      async (action) => {
        const event = new ModerationActionTakenEvent(
          'action-1',
          'report-1',
          'admin-1',
          'user-1',
          action,
          'Violation',
          60,
        );

        await moderationEventHandler.handleModerationActionTaken(event);

        expect(mockValkeyService.set).not.toHaveBeenCalled();
        expect(mockValkeyService.hSetMultiple).not.toHaveBeenCalled();
        expect(mockValkeyService.expire).not.toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(
          `Moderation action '${action}' on user user-1 is not an account restriction; restriction cache untouched`,
          'ModerationEventHandler',
        );
      },
    );

    it('should read the TTL from the shared policy the service also reads', async () => {
      const event = new ModerationActionTakenEvent(
        'action-1',
        'report-1',
        'admin-1',
        'user-1',
        'ban',
        'Violation',
        SEVEN_DAYS_MINUTES,
      );

      await moderationEventHandler.handleModerationActionTaken(event);

      expect(restrictionTtlSeconds('ban', SEVEN_DAYS_MINUTES)).toBe(SEVEN_DAYS_MINUTES * 60);
      expect(mockValkeyService.set).toHaveBeenCalledWith(
        'restriction:user-1',
        'ban',
        restrictionTtlSeconds('ban', SEVEN_DAYS_MINUTES),
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
