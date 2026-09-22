import { Module } from '@nestjs/common';
import { MessageReadReceiptsController } from './message-read-receipts.controller.js';
import { MessageReadReceiptsService } from './services/message-read-receipts.service.js';
import { MESSAGE_READ_RECEIPTS_REPOSITORY } from './interfaces/message-read-receipts-repository.interface.js';
import { MessageReadReceiptsRepository } from './repositories/message-read-receipts.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [MessageReadReceiptsController],
  providers: [
    MessageReadReceiptsService,
    {
      provide: MESSAGE_READ_RECEIPTS_REPOSITORY,
      useClass: MessageReadReceiptsRepository,
    },
  ],
  exports: [MessageReadReceiptsService, MESSAGE_READ_RECEIPTS_REPOSITORY],
})
export class MessageReadReceiptsModule {}
