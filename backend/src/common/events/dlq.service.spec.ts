import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DLQService } from './dlq.service.ts';
import { ValkeyService } from '../services/valkey.service.ts';

type MockValkeyService = {
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  sadd: ReturnType<typeof vi.fn>;
  smembers: ReturnType<typeof vi.fn>;
  srem: ReturnType<typeof vi.fn>;
};

describe('DLQService', () => {
  let dlqService: DLQService;
  let valkeyService: MockValkeyService;

  beforeEach(() => {
    valkeyService = {
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      sadd: vi.fn(),
      smembers: vi.fn(),
      srem: vi.fn(),
    };

    dlqService = new DLQService(valkeyService as unknown as ValkeyService);
  });

  describe('add', () => {
    it('should add an event to DLQ and return an id', async () => {
      const id = await dlqService.add({
        eventName: 'user.registered',
        payload: { userId: '1', email: 'test@example.com', name: 'Test' },
        error: 'validation error',
        timestamp: new Date(),
        retryCount: 0,
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(valkeyService.set).toHaveBeenCalled();
      expect(valkeyService.sadd).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return the DLQ event by id', async () => {
      const event = {
        id: 'dlq-1',
        eventName: 'user.registered',
        payload: { userId: '1' },
        error: 'validation error',
        timestamp: new Date(),
        retryCount: 0,
      };
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(event));

      const result = await dlqService.get('dlq-1');
      expect(result).toEqual(event);
    });

    it('should return null if event not found', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      const result = await dlqService.get('dlq-1');
      expect(result).toBeNull();
    });
  });

  describe('retry', () => {
    it('should increment retry count', async () => {
      const event = {
        id: 'dlq-1',
        eventName: 'user.registered',
        payload: { userId: '1' },
        error: 'validation error',
        timestamp: new Date().toISOString(),
        retryCount: 0,
      };
      vi.mocked(valkeyService.get).mockResolvedValue(JSON.stringify(event));

      await dlqService.retry('dlq-1');
      expect(valkeyService.set).toHaveBeenCalled();
      expect(valkeyService.sadd).toHaveBeenCalled();
    });

    it('should not fail if event not found', async () => {
      vi.mocked(valkeyService.get).mockResolvedValue(null);
      await expect(dlqService.retry('dlq-1')).resolves.toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete the event from DLQ', async () => {
      await dlqService.delete('dlq-1');
      expect(valkeyService.del).toHaveBeenCalledWith('dlq:dlq-1');
      expect(valkeyService.srem).toHaveBeenCalledWith('dlq:index', 'dlq-1');
    });
  });

  describe('list', () => {
    it('should return all DLQ events sorted by timestamp', async () => {
      const olderEvent = {
        id: 'dlq-1',
        eventName: 'user.registered',
        payload: {},
        error: 'err1',
        timestamp: new Date(Date.now() - 1000).toISOString(),
        retryCount: 0,
      };
      const newerEvent = {
        id: 'dlq-2',
        eventName: 'story.created',
        payload: {},
        error: 'err2',
        timestamp: new Date().toISOString(),
        retryCount: 1,
      };
      vi.mocked(valkeyService.smembers).mockResolvedValue(['dlq-1', 'dlq-2']);
      vi.mocked(valkeyService.get).mockImplementation((key: string) => {
        if (key === 'dlq:dlq-1') return Promise.resolve(JSON.stringify(olderEvent));
        if (key === 'dlq:dlq-2') return Promise.resolve(JSON.stringify(newerEvent));
        return Promise.resolve(null);
      });

      const events = await dlqService.list();
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('dlq-2');
      expect(events[1].id).toBe('dlq-1');
    });
  });

  describe('clear', () => {
    it('should clear all DLQ events', async () => {
      vi.mocked(valkeyService.smembers).mockResolvedValue(['dlq-1', 'dlq-2']);

      await dlqService.clear();
      expect(valkeyService.del).toHaveBeenCalledTimes(3);
      expect(valkeyService.del).toHaveBeenCalledWith('dlq:index');
    });
  });

  describe('getStats', () => {
    it('should return stats', async () => {
      const events = [
        { id: 'dlq-1', eventName: 'user.registered', payload: {}, error: 'err1', timestamp: new Date(), retryCount: 0 },
        { id: 'dlq-2', eventName: 'user.registered', payload: {}, error: 'err2', timestamp: new Date(), retryCount: 1 },
        { id: 'dlq-3', eventName: 'story.created', payload: {}, error: 'err3', timestamp: new Date(), retryCount: 0 },
      ];
      vi.mocked(valkeyService.smembers).mockResolvedValue(['dlq-1', 'dlq-2', 'dlq-3']);
      vi.mocked(valkeyService.get).mockImplementation((key: string) => {
        const id = key.replace('dlq:', '');
        const event = events.find((e) => e.id === id);
        return Promise.resolve(event ? JSON.stringify(event) : null);
      });

      const stats = await dlqService.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byEvent['user.registered']).toBe(2);
      expect(stats.byEvent['story.created']).toBe(1);
    });
  });
});
