import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ModerationService } from './moderation.service.ts';

vi.mock('../../db/index.ts', () => {
  const makeChain = (result: unknown) => {
    const chain: any = {
      returning: vi.fn(() => Promise.resolve(result)),
      where: vi.fn(() => Promise.resolve(result)),
    };
    chain.from = vi.fn(() => chain);
    chain.set = vi.fn(() => chain);
    chain.values = vi.fn(() => chain);
    return chain;
  };

  return {
    db: {
      insert: vi.fn(() => makeChain([{ id: 'report-1', reporterId: 'reporter-1', targetId: 'uuid', targetType: 'story', reason: 'Spam', description: null, status: 'open', escalatedAt: null, resolvedAt: null, createdAt: new Date(), updatedAt: new Date() }])),
      update: vi.fn(() => makeChain([{ id: 'report-1', status: 'resolved', updatedAt: new Date() }])),
      select: vi.fn(() => makeChain([{ total: '0' }])),
      delete: vi.fn(() => makeChain(undefined)),
    },
  };
});

describe('ModerationService', () => {
  let moderationService: ModerationService;
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    moderationService = new ModerationService(mockLogger as any, null, null);
  });

  describe('createReport', () => {
    it('should create a report successfully', async () => {
      const dto = { targetId: 'uuid', targetType: 'story' as const, reason: 'Spam' };
      const report = await moderationService.createReport('reporter-1', dto);
      expect(report.reporterId).toBe('reporter-1');
      expect(report.reason).toBe('Spam');
      expect(report.status).toBe('open');
    });
  });
});
