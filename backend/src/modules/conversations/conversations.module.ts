import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './services/conversations.service.js';
import { CONVERSATIONS_REPOSITORY } from './interfaces/conversations-repository.interface.js';
import { ConversationsRepository } from './repositories/conversations.repository.js';
import { MessagesModule } from '../messages/messages.module.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule, MessagesModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    {
      provide: CONVERSATIONS_REPOSITORY,
      useClass: ConversationsRepository,
    },
  ],
  exports: [ConversationsService, CONVERSATIONS_REPOSITORY],
})
export class ConversationsModule {}
