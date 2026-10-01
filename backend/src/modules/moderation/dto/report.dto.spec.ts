import { describe, it, expect } from 'vitest';

import {
  CreateReportDto,
  ReportQueryDto,
  UpdateReportStatusDto,
  ModerationActionDto,
  REPORT_STATUSES,
} from './report.dto.ts';

const SERVICE_WRITABLE_STATUSES = ['open', 'in_review', 'escalated', 'resolved', 'dismissed'] as const;

function acceptedStatuses(): string[] {
  return SERVICE_WRITABLE_STATUSES.filter((status) => UpdateReportStatusDto.safeParse({ status }).success);
}

describe('moderation report DTOs', () => {
  describe('CreateReportDto', () => {
    it('should accept a well formed report', () => {
      const parsed = CreateReportDto.parse({
        targetId: '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
        targetType: 'story',
        reason: 'Spam',
      });

      expect(parsed.reason).toBe('Spam');
      expect(parsed.targetType).toBe('story');
    });

    it.each(['story', 'comment', 'user'] as const)('should accept the %s target type', (targetType) => {
      expect(
        CreateReportDto.parse({ targetId: '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8', targetType, reason: 'Spam' }),
      ).toEqual({ targetId: '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8', targetType, reason: 'Spam' });
    });

    it('should reject a non uuid target id', () => {
      expect(() => CreateReportDto.parse({ targetId: 'not-a-uuid', targetType: 'story', reason: 'Spam' })).toThrow();
    });

    it('should reject an unknown target type', () => {
      expect(() =>
        CreateReportDto.parse({ targetId: '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8', targetType: 'book', reason: 'Spam' }),
      ).toThrow();
    });

    it('should reject an empty reason', () => {
      expect(() =>
        CreateReportDto.parse({ targetId: '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8', targetType: 'story', reason: '' }),
      ).toThrow();
    });

    it('should reject a reason longer than five hundred characters', () => {
      expect(() =>
        CreateReportDto.parse({
          targetId: '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
          targetType: 'story',
          reason: 'x'.repeat(501),
        }),
      ).toThrow();
    });

    it('should reject a description longer than one thousand characters', () => {
      expect(() =>
        CreateReportDto.parse({
          targetId: '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
          targetType: 'story',
          reason: 'Spam',
          description: 'x'.repeat(1001),
        }),
      ).toThrow();
    });
  });

  describe('UpdateReportStatusDto', () => {
    it.each(['open', 'in_review', 'resolved', 'dismissed'] as const)('should accept the %s status', (status) => {
      expect(UpdateReportStatusDto.parse({ status })).toEqual({ status });
    });

    it('should reject an unknown status', () => {
      expect(() => UpdateReportStatusDto.parse({ status: 'deleted' })).toThrow();
    });

    it('should reject a missing status', () => {
      expect(() => UpdateReportStatusDto.parse({})).toThrow();
    });

    it('should accept the escalated status the auto-escalation job writes', () => {
      expect(UpdateReportStatusDto.parse({ status: 'escalated' })).toEqual({ status: 'escalated' });
    });
  });

  describe('ReportQueryDto', () => {
    it('should default to the first page of twenty', () => {
      expect(ReportQueryDto.parse({})).toEqual({ page: 1, limit: 20 });
    });

    it('should reject a page below one', () => {
      expect(() => ReportQueryDto.parse({ page: 0 })).toThrow();
    });

    it('should reject a limit above one hundred', () => {
      expect(() => ReportQueryDto.parse({ limit: 101 })).toThrow();
    });

    it('should reject an unknown target type filter', () => {
      expect(() => ReportQueryDto.parse({ targetType: 'book' })).toThrow();
    });

    it('should accept the escalated status the auto-escalation job writes', () => {
      expect(ReportQueryDto.parse({ status: 'escalated' }).status).toBe('escalated');
    });

    it('should coerce the string query parameters the wire actually delivers', () => {
      expect(ReportQueryDto.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
    });

    it('should reject a non numeric page', () => {
      expect(() => ReportQueryDto.parse({ page: 'abc' })).toThrow();
    });
  });

  describe('ModerationActionDto', () => {
    it.each(['warn', 'mute', 'ban', 'content_removal', 'no_action'] as const)(
      'should accept the %s action',
      (action) => {
        expect(ModerationActionDto.parse({ action, reason: 'because' })).toEqual({ action, reason: 'because' });
      },
    );

    it('should reject an unknown action', () => {
      expect(() => ModerationActionDto.parse({ action: 'delete_account', reason: 'because' })).toThrow();
    });

    it('should reject an empty reason', () => {
      expect(() => ModerationActionDto.parse({ action: 'ban', reason: '' })).toThrow();
    });

    it('should reject a non positive duration', () => {
      expect(() => ModerationActionDto.parse({ action: 'ban', reason: 'because', durationMinutes: 0 })).toThrow();
    });

    it('should reject a non integer duration', () => {
      expect(() => ModerationActionDto.parse({ action: 'ban', reason: 'because', durationMinutes: 1.5 })).toThrow();
    });

    it('should reject a non uuid target user id', () => {
      expect(() => ModerationActionDto.parse({ action: 'ban', reason: 'because', targetUserId: 'user-1' })).toThrow();
    });

    it('should accept a positive integer duration', () => {
      expect(ModerationActionDto.parse({ action: 'ban', reason: 'because', durationMinutes: 60 }).durationMinutes).toBe(
        60,
      );
    });
  });

  describe('status vocabulary', () => {
    it('should declare exactly the statuses the service persists', () => {
      expect([...REPORT_STATUSES]).toEqual([...SERVICE_WRITABLE_STATUSES]);
    });

    it('should cover every status the service writes', () => {
      expect(acceptedStatuses()).toEqual([...SERVICE_WRITABLE_STATUSES]);
    });
  });
});
