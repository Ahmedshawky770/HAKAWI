import { Module } from '@nestjs/common';
import { ConversationsService } from './services/conversations.service.js';
import { ConversationsController } from './controllers/conversations.controller.js';
import { ConversationsRepository } from './repositories/conversations.repository.js';

@Module({
  imports: [],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsRepository],
  exports: [ConversationsService],
})
export class ConversationsModule {}
