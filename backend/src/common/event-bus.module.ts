import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { EventSchemaRegistry } from './events/event-schema-registry.ts';
import { DLQService } from './events/dlq.service.ts';
import { EventValidatorService } from './events/event-validator.service.ts';
import { ValkeyService } from './services/valkey.service.ts';
import { WinstonLoggerService } from './services/winston-logger.service.ts';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),
  ],
  providers: [EventSchemaRegistry, DLQService, EventValidatorService, ValkeyService, WinstonLoggerService],
  exports: [EventSchemaRegistry, DLQService, EventValidatorService, EventEmitterModule],
})
export class EventBusModule {}
