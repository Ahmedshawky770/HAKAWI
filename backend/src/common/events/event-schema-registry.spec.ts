import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventSchemaRegistry } from './event-schema-registry.ts';
import type { DLQService } from './dlq.service.ts';
import { UserRegisteredSchema, UserDeletedSchema } from './event-schemas.ts';
import { z } from 'zod';

type MockDLQService = {
  add: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

describe('EventSchemaRegistry', () => {
  let registry: EventSchemaRegistry;
  let dlqService: MockDLQService;

  beforeEach(() => {
    dlqService = {
      add: vi.fn(),
      get: vi.fn(),
      retry: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    };

    registry = new EventSchemaRegistry(dlqService as unknown as DLQService);
    registry.registerSchema('custom.event', UserRegisteredSchema, 'v1');
  });

  describe('validateEvent', () => {
    it('should validate a valid event', () => {
      const result = registry.validateEvent('user.registered', { userId: '1', email: 'test@example.com', name: 'Test' });
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should return error for invalid payload', () => {
      const result = registry.validateEvent('user.registered', { userId: '1', email: 'invalid', name: 'Test' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for unknown event', () => {
      const result = registry.validateEvent('unknown.event', { foo: 'bar' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No schema registered');
    });

    it('should validate with explicit version', () => {
      const result = registry.validateEvent('custom.event', { userId: '1', email: 'test@example.com', name: 'Test' }, 'v1');
      expect(result.success).toBe(true);
    });
  });

  describe('registerSchema', () => {
    it('should register a new schema', () => {
      const result = registry.validateEvent('custom.event', { userId: '1', email: 'test@example.com', name: 'Test' }, 'v1');
      expect(result.success).toBe(true);
    });

    it('should use default version when none specified', () => {
      const result = registry.validateEvent('custom.event', { userId: '1', email: 'test@example.com', name: 'Test' });
      expect(result.success).toBe(true);
    });
  });

  describe('sendToDLQ', () => {
    it('should send invalid event to DLQ', async () => {
      await registry.sendToDLQ('user.registered', { invalid: true }, 'validation error');
      expect(dlqService.add).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'user.registered',
          payload: { invalid: true },
          error: 'validation error',
          retryCount: 0,
        }),
      );
    });
  });

  describe('retryDLQ', () => {
    it('should retry and delete from DLQ if valid', async () => {
      vi.mocked(dlqService.get).mockResolvedValue({
        id: 'dlq-1',
        eventName: 'user.registered',
        payload: { userId: '1', email: 'test@example.com', name: 'Test' },
        error: 'validation error',
        timestamp: new Date(),
        retryCount: 0,
      });

      const result = await registry.retryDLQ('dlq-1');
      expect(result).toBe(true);
      expect(dlqService.delete).toHaveBeenCalledWith('dlq-1');
    });

    it('should increment retry count if invalid', async () => {
      vi.mocked(dlqService.get).mockResolvedValue({
        id: 'dlq-1',
        eventName: 'user.registered',
        payload: { invalid: true },
        error: 'validation error',
        timestamp: new Date(),
        retryCount: 0,
      });

      const result = await registry.retryDLQ('dlq-1');
      expect(result).toBe(false);
      expect(dlqService.retry).toHaveBeenCalledWith('dlq-1');
    });

    it('should return false if DLQ event not found', async () => {
      vi.mocked(dlqService.get).mockResolvedValue(null);
      const result = await registry.retryDLQ('dlq-1');
      expect(result).toBe(false);
    });
  });

  describe('getDLQStats', () => {
    it('should return DLQ stats', async () => {
      vi.mocked(dlqService.list).mockResolvedValue([
        {
          id: 'dlq-1',
          eventName: 'user.registered',
          payload: {},
          error: 'err1',
          timestamp: new Date(),
          retryCount: 1,
        },
        {
          id: 'dlq-2',
          eventName: 'story.created',
          payload: {},
          error: 'err2',
          timestamp: new Date(),
          retryCount: 2,
        },
      ]);

      const stats = await registry.getDLQStats();
      expect(stats.total).toBe(2);
      expect(stats.events).toHaveLength(2);
    });
  });
});
