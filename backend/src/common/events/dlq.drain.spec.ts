import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../services/winston-logger.service.ts';
import { DLQService, type DLQEvent } from './dlq.service.ts';
import { EventSchemaRegistry, type ValidationResult } from './event-schema-registry.ts';
import { EventValidatorService } from './event-validator.service.ts';

/**
 * The dead-letter queue had a drain method that was not a drain.
 *
 * `EventSchemaRegistry.retryDLQ` DELETED a now-valid entry and returned `true` without re-emitting it,
 * and its spec — 'should retry and delete from DLQ if valid' — asserted exactly that, so the suite was
 * green while every dead-lettered event was silently discarded. `getDLQStats` likewise had no caller
 * outside its own spec. Nothing drained the queue: a schema-validation failure was written to Valkey
 * and then lost at the 7-day TTL.
 *
 * These cases assert the three properties the purge lacked: it DELIVERS, it re-validates first, and
 * it does not lose an event it cannot deliver.
 */
const parked = (overrides: Partial<DLQEvent> = {}): DLQEvent => ({
  id: 'dlq-1',
  eventName: 'user.registered',
  payload: { userId: '1', email: 'test@example.com', name: 'Test' },
  error: 'validation error',
  timestamp: new Date('2026-01-01'),
  retryCount: 0,
  ...overrides,
});

describe('EventValidatorService.replayDeadLettered', () => {
  let validator: EventValidatorService;
  let dlqService: {
    get: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  let registry: { validateEvent: ReturnType<typeof vi.fn>; sendToDLQ: ReturnType<typeof vi.fn> };
  let emitter: { emit: ReturnType<typeof vi.fn> };

  const valid: ValidationResult = { success: true };
  const invalid = (error: string): ValidationResult => ({ success: false, error });

  beforeEach(() => {
    dlqService = { get: vi.fn(), delete: vi.fn(), retry: vi.fn(), list: vi.fn() };
    registry = { validateEvent: vi.fn(), sendToDLQ: vi.fn() };
    emitter = { emit: vi.fn() };

    validator = new EventValidatorService(
      registry as unknown as EventSchemaRegistry,
      dlqService as unknown as DLQService,
      emitter as unknown as EventEmitter2,
      {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
        verbose: vi.fn(),
      } as unknown as WinstonLoggerService,
    );
  });

  it('RE-DELIVERS a parked event that now validates, then removes it from the queue', async () => {
    // The purge DELETED and returned true. Delivering is the whole point of a retry.
    dlqService.get.mockResolvedValue(parked());
    registry.validateEvent.mockReturnValue(valid);

    const outcome = await validator.replayDeadLettered('dlq-1');

    expect(outcome).toEqual({ replayed: true, reason: 'delivered' });
    expect(emitter.emit).toHaveBeenCalledWith('user.registered', parked().payload);
    expect(dlqService.delete).toHaveBeenCalledWith('dlq-1');
  });

  it('re-validates before delivering, using the parked event name', async () => {
    dlqService.get.mockResolvedValue(parked());
    registry.validateEvent.mockReturnValue(valid);

    await validator.replayDeadLettered('dlq-1');

    expect(registry.validateEvent).toHaveBeenCalledWith('user.registered', parked().payload);
  });

  it('does NOT emit when the payload still fails validation, and bumps the retry count instead', async () => {
    // A partial replay is worse than no replay: the payload would reach subscribers having never
    // satisfied the schema.
    dlqService.get.mockResolvedValue(parked({ payload: { invalid: true } }));
    registry.validateEvent.mockReturnValue(invalid('still missing userId'));

    const outcome = await validator.replayDeadLettered('dlq-1');

    expect(outcome.replayed).toBe(false);
    expect(outcome.reason).toBe('still missing userId');
    expect(emitter.emit).not.toHaveBeenCalled();
    expect(dlqService.delete).not.toHaveBeenCalled();
    expect(dlqService.retry).toHaveBeenCalledWith('dlq-1');
  });

  it('reports not-found for an id that is not parked, without touching the emitter', async () => {
    dlqService.get.mockResolvedValue(null);

    const outcome = await validator.replayDeadLettered('dlq-missing');

    expect(outcome).toEqual({ replayed: false, reason: 'not-found' });
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('survives a payload that came back from the dead-letter store as JSON', async () => {
    // `dlq.service` persists to Valkey, so a parked payload round-trips through JSON and its `Date`
    // fields arrive as strings. Zod coerces them, so the replay must not re-emit the original object
    // with a string where the subscriber expects a Date.
    const roundTripped = parked({ payload: { userId: '1', publishedAt: '2026-01-01T00:00:00.000Z' } });
    dlqService.get.mockResolvedValue(roundTripped);
    registry.validateEvent.mockReturnValue(valid);

    await validator.replayDeadLettered('dlq-1');

    expect(emitter.emit).toHaveBeenCalledWith('user.registered', roundTripped.payload);
  });
});

describe('EventValidatorService.listDeadLettered', () => {
  let validator: EventValidatorService;
  let dlqService: { list: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    dlqService = { list: vi.fn() };
    validator = new EventValidatorService(
      { validateEvent: vi.fn(), sendToDLQ: vi.fn() } as unknown as EventSchemaRegistry,
      dlqService as unknown as DLQService,
      { emit: vi.fn() } as unknown as EventEmitter2,
      {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
        verbose: vi.fn(),
      } as unknown as WinstonLoggerService,
    );
  });

  it('bounds the list, because DLQService.list has no ceiling of its own', async () => {
    // An operator endpoint that returns an unbounded list is the same defect as the unbounded
    // `?limit` the pagination DTOs exist to prevent.
    dlqService.list.mockResolvedValue(Array.from({ length: 500 }, (_, i) => parked({ id: `dlq-${i}` })));

    const events = await validator.listDeadLettered(100);

    expect(events).toHaveLength(100);
  });

  it('refuses a limit outside 1..500 rather than silently clamping to nothing', async () => {
    dlqService.list.mockResolvedValue([parked()]);

    await expect(validator.listDeadLettered(0)).resolves.toEqual([]);
    await expect(validator.listDeadLettered(9999)).resolves.toEqual([]);
  });

  it('exposes the fields an operator needs and not the payload', async () => {
    dlqService.list.mockResolvedValue([parked()]);

    const [event] = await validator.listDeadLettered(10);

    expect(event).toEqual({
      id: 'dlq-1',
      eventName: 'user.registered',
      error: 'validation error',
      retryCount: 0,
      timestamp: new Date('2026-01-01'),
    });
    expect(event).not.toHaveProperty('payload');
  });
});
