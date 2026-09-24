import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventValidatorService } from './event-validator.service.ts';
import { EventSchemaRegistry } from './event-schema-registry.ts';
import type { DLQService } from './dlq.service.ts';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WinstonLoggerService } from '../services/winston-logger.service.ts';

type MockDLQService = {
  add: ReturnType<typeof vi.fn>;
};

type MockEventSchemaRegistry = {
  validateEvent: ReturnType<typeof vi.fn>;
  sendToDLQ: ReturnType<typeof vi.fn>;
};

describe('EventValidatorService', () => {
  let eventValidatorService: EventValidatorService;
  let registry: MockEventSchemaRegistry;
  let dlqService: MockDLQService;
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };
  let logger: { error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    registry = {
      validateEvent: vi.fn(),
      sendToDLQ: vi.fn(),
    };

    dlqService = {
      add: vi.fn(),
    };

    eventEmitter = { emit: vi.fn() };
    logger = { error: vi.fn() };

    eventValidatorService = new EventValidatorService(
      registry as unknown as EventSchemaRegistry,
      dlqService as unknown as DLQService,
      eventEmitter as unknown as EventEmitter2,
      logger as unknown as WinstonLoggerService,
    );
  });

  describe('emit', () => {
    it('should emit the event when validation succeeds', async () => {
      registry.validateEvent.mockReturnValue({ success: true, data: { userId: '1' } } as never);

      await eventValidatorService.emit('user.registered', { userId: '1', email: 'test@example.com', name: 'Test' });

      expect(eventEmitter.emit).toHaveBeenCalledWith('user.registered', { userId: '1', email: 'test@example.com', name: 'Test' });
      expect(registry.sendToDLQ).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should log and send to DLQ when validation fails', async () => {
      registry.validateEvent.mockReturnValue({ success: false, error: 'Invalid email' } as never);
      registry.sendToDLQ.mockResolvedValue(undefined as never);

      await eventValidatorService.emit('user.registered', { userId: '1', email: 'invalid', name: 'Test' });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Event validation failed for user.registered: Invalid email', 'EventValidatorService');
      expect(registry.sendToDLQ).toHaveBeenCalledWith('user.registered', { userId: '1', email: 'invalid', name: 'Test' }, 'Invalid email');
    });
  });

  describe('validateEvent', () => {
    it('should return true when validation succeeds', async () => {
      registry.validateEvent.mockReturnValue({ success: true, data: { userId: '1' } } as never);

      const result = await eventValidatorService.validateEvent('user.registered', { userId: '1', email: 'test@example.com', name: 'Test' });
      expect(result).toBe(true);
    });

    it('should return false when validation fails', async () => {
      registry.validateEvent.mockReturnValue({ success: false, error: 'Invalid email' } as never);
      registry.sendToDLQ.mockResolvedValue(undefined as never);

      const result = await eventValidatorService.validateEvent('user.registered', { userId: '1', email: 'invalid', name: 'Test' });
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
      expect(registry.sendToDLQ).toHaveBeenCalled();
    });
  });
});
