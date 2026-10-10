import { Injectable, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../services/winston-logger.service.ts';

import { EventSchemaRegistry, ValidationResult } from './event-schema-registry.ts';
import { DLQService } from './dlq.service.ts';

@Injectable()
export class EventValidatorService {
  constructor(
    @Inject(EventSchemaRegistry) private readonly registry: EventSchemaRegistry,
    @Inject(DLQService) private readonly dlqService: DLQService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  async emit(eventName: string, payload: unknown): Promise<void> {
    const result: ValidationResult = this.registry.validateEvent(eventName, payload);
    if (result.success) {
      this.eventEmitter.emit(eventName, payload);
    } else {
      const errorMessage = result.error ?? 'Unknown validation error';
      this.logger.error(`Event validation failed for ${eventName}: ${errorMessage}`, 'EventValidatorService');
      await this.registry.sendToDLQ(eventName, payload, errorMessage);
    }
  }

  async validateEvent(eventName: string, payload: unknown): Promise<boolean> {
    const result: ValidationResult = this.registry.validateEvent(eventName, payload);
    if (!result.success) {
      const errorMessage = result.error ?? 'Unknown validation error';
      this.logger.error(`Event validation failed for ${eventName}: ${errorMessage}`, 'EventValidatorService');
      await this.registry.sendToDLQ(eventName, payload, errorMessage);
      return false;
    }
    return true;
  }

  /**
   * Re-delivers one dead-lettered event.
   *
   * WHY THIS EXISTS AT ALL. A dead-letter queue nobody drains is a log table. `EventSchemaRegistry`
   * already had a `retryDLQ`, and it was worse than useless: on a payload that now validated it DELETED
   * the entry and returned `true` without ever re-emitting, so a dead-lettered event was silently
   * discarded; on a payload that still failed it only incremented a counter until the 7-day TTL
   * expired. `getDLQStats` likewise had no caller outside its own spec. So every schema-validation
   * failure was written to Valkey and then lost, and the roadmap's "Dead Letter Queue ✅" described a
   * store rather than a mechanism.
   *
   * WHY IT LIVES HERE RATHER THAN IN THE REGISTRY. `emit` is the only path that validates AND
   * delivers, and it needs the emitter — which the registry does not have (the dependency runs the
   * other way, registry -> validator). Putting the drain here is what makes the retry actually deliver.
   *
   * WHY A REPLAY ROUTES BACK THROUGH VALIDATION. The schema may have been fixed since the event was
   * parked, and the payload may have come back from Valkey as JSON, so a `Date` field is now a string.
   * Re-validating means a payload that still fails is NOT emitted — a partial replay is worse than no
   * replay — and its `retryCount` is bumped so the operator can see it is not converging.
   */
  async replayDeadLettered(eventId: string): Promise<{ replayed: boolean; reason: string }> {
    const parked = await this.dlqService.get(eventId);
    if (!parked) {
      return { replayed: false, reason: 'not-found' };
    }

    const result = this.registry.validateEvent(parked.eventName, parked.payload);
    if (!result.success) {
      await this.dlqService.retry(eventId);
      this.logger.error(
        `Dead-lettered event ${eventId} (${parked.eventName}) still fails validation: ${result.error}`,
        'EventValidatorService',
      );
      return { replayed: false, reason: result.error ?? 'still-invalid' };
    }

    this.eventEmitter.emit(parked.eventName, parked.payload);
    await this.dlqService.delete(eventId);
    this.logger.info(
      `Replayed dead-lettered event ${eventId} (${parked.eventName}) after ${parked.retryCount} prior attempt(s)`,
      'EventValidatorService',
    );
    return { replayed: true, reason: 'delivered' };
  }

  /**
   * Everything currently parked, oldest first.
   *
   * Bounded because this is an operator endpoint: the DLQ holds one entry per rejected event for seven
   * days, and an unbounded list is the same mistake as the unbounded `?limit` this repository just
   * fixed elsewhere. `DLQService.list` has no ceiling of its own.
   */
  async listDeadLettered(
    limit = 100,
  ): Promise<Array<{ id: string; eventName: string; error: string; retryCount: number; timestamp: Date }>> {
    if (limit < 1 || limit > 500) {
      return [];
    }
    const events = await this.dlqService.list();
    return events.slice(0, limit).map((event) => ({
      id: event.id,
      eventName: event.eventName,
      error: event.error,
      retryCount: event.retryCount,
      timestamp: event.timestamp,
    }));
  }
}
