import { Module } from '@nestjs/common';
import { BookEventHandler } from './book.event-handler.js';
import { ContestEventHandler } from './contest.event-handler.js';
import { MessageEventHandler } from './message.event-handler.js';
import { NotificationEventHandler } from './notification.event-handler.js';
import { PaymentEventHandler } from './payment.event-handler.js';
import { ModerationEventHandler } from './moderation.event-handler.js';
import { WinstonLoggerService } from '../services/winston-logger.service.js';
import { ValkeyService } from '../services/valkey.service.js';

@Module({
  providers: [
    BookEventHandler,
    ContestEventHandler,
    MessageEventHandler,
    NotificationEventHandler,
    PaymentEventHandler,
    ModerationEventHandler,
    WinstonLoggerService,
    ValkeyService,
  ],
  exports: [
    BookEventHandler,
    ContestEventHandler,
    MessageEventHandler,
    NotificationEventHandler,
    PaymentEventHandler,
    ModerationEventHandler,
  ],
})
export class EventHandlersModule {}
