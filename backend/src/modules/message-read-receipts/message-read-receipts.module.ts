import { Module } from '@nestjs/common';
import { MessageReadReceiptsService } from './services/message-read-receipts.service.js';
import { MessageReadReceiptsController } from './controllers/message-read-receipts.controller.js';
import { MessageReadReceiptsRepository } from './repositories/message-read-receipts.repository.js';

@Module({
  imports: [],
  controllers: [MessageReadReceiptsController],
  providers: [MessageReadReceiptsService, MessageReadReceiptsRepository],
  exports: [MessageReadReceiptsService],
})
export class MessageReadReceiptsModule {}
