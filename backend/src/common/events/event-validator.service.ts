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
}
