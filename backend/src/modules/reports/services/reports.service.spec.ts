import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReportsService, REPORT_STATUS } from './reports.service.js';
import type { ReportsRepository } from '../repositories/reports.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

type MockReportsRepository = Partial<ReportsRepository>;
type MockEventEmitter2 = Partial<EventEmitter2>;

const createMockReport = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'report-123',
  reporterId: 'user-1',
  targetId: 'user-2',
  targetType: 'user',
  reason: 'Spam',
  status: 'open',
  description: 'Test description',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('ReportsService', () => {
  let reportsService: ReportsService;
  let reportsRepository: MockReportsRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    reportsRepository = {
      findById: vi.fn(),
      findByReporterId: vi.fn(),
      findByTargetId: vi.fn(),
      findByStatus: vi.fn(),
      findOpenReports: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      countByTarget: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    reportsService = new ReportsService(
      reportsRepository as ReportsRepository,
      eventEmitter as EventEmitter2,
    );
  });

  describe('findById', () => {
    it('should return report when found', async () => {
      const report = createMockReport();
      vi.mocked(reportsRepository.findById).mockResolvedValue(report as any);

      const result = await reportsService.findById('report-123');

      expect(result).toEqual(report);
    });

    it('should throw NotFoundException when report not found', async () => {
      vi.mocked(reportsRepository.findById).mockResolvedValue(null);

      await expect(reportsService.findById('report-123')).rejects.toThrow('Report not found');
    });
  });

  describe('findByReporterId', () => {
    it('should return reports by reporter', async () => {
      const reports = [createMockReport()];
      vi.mocked(reportsRepository.findByReporterId).mockResolvedValue(reports as any);

      const result = await reportsService.findByReporterId('user-1');

      expect(result).toEqual(reports);
    });
  });

  describe('findByTargetId', () => {
    it('should return reports by target', async () => {
      const reports = [createMockReport()];
      vi.mocked(reportsRepository.findByTargetId).mockResolvedValue(reports as any);

      const result = await reportsService.findByTargetId('user-2', 'user');

      expect(result).toEqual(reports);
    });
  });

  describe('findByStatus', () => {
    it('should return reports by status', async () => {
      const reports = [createMockReport()];
      vi.mocked(reportsRepository.findByStatus).mockResolvedValue(reports as any);

      const result = await reportsService.findByStatus('open');

      expect(result).toEqual(reports);
    });
  });

  describe('findOpenReports', () => {
    it('should return open reports', async () => {
      const reports = [createMockReport()];
      vi.mocked(reportsRepository.findOpenReports).mockResolvedValue(reports as any);

      const result = await reportsService.findOpenReports();

      expect(result).toEqual(reports);
    });
  });

  describe('create', () => {
    it('should create report and emit event', async () => {
      const report = createMockReport();
      vi.mocked(reportsRepository.findByTargetId).mockResolvedValue([]);
      vi.mocked(reportsRepository.create).mockResolvedValue(report as any);

      const result = await reportsService.create('user-1', {
        targetId: 'user-2',
        targetType: 'user',
        reason: 'Spam',
        description: 'Spamming',
      });

      expect(result).toEqual(report);
      expect(eventEmitter.emit).toHaveBeenCalledWith('content.reported', {
        reportId: 'report-123',
        reporterId: 'user-1',
        targetId: 'user-2',
        targetType: 'user',
        reason: 'Spam',
      });
    });

    it('should throw BadRequestException when reporting self', async () => {
      await expect(reportsService.create('user-1', {
        targetId: 'user-1',
        targetType: 'user',
        reason: 'Spam',
      })).rejects.toThrow('You cannot report yourself');
    });

    it('should throw ConflictException when already reported', async () => {
      vi.mocked(reportsRepository.findByTargetId).mockResolvedValue([createMockReport({ reporterId: 'user-1' })]);

      await expect(reportsService.create('user-1', {
        targetId: 'user-2',
        targetType: 'user',
        reason: 'Spam',
      })).rejects.toThrow('You have already reported this content');
    });
  });

  describe('update', () => {
    it('should update report', async () => {
      const updatedReport = createMockReport({ status: REPORT_STATUS.INVESTIGATING });
      vi.mocked(reportsRepository.update).mockResolvedValue(updatedReport as any);

      const result = await reportsService.update('report-123', { status: REPORT_STATUS.INVESTIGATING } as any);

      expect(result).toEqual(updatedReport);
    });
  });

  describe('countByTarget', () => {
    it('should return report count by target', async () => {
      vi.mocked(reportsRepository.countByTarget).mockResolvedValue(5);

      const result = await reportsService.countByTarget('user-2', 'user');

      expect(result).toBe(5);
    });
  });
});
