import { Module } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { CommonModule } from '../../common/common.module.ts';

import { MessagesService } from './messages.service.ts';
import { MessagesController } from './controllers/messages.controller.ts';
import { ConversationsRepository } from './repositories/conversations.repository.ts';
import { MessagesRepository } from './repositories/messages.repository.ts';
import { CONVERSATIONS_REPOSITORY } from './interfaces/messages-repository.interface.ts';
import { MESSAGES_REPOSITORY } from './interfaces/messages-repository.interface.ts';
import { MessagesEventHandler } from './events/messages.event-handler.ts';
import { MessagesGateway } from './gateways/messages.gateway.ts';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [MessagesController],
  providers: [
    MessagesService,
    MessagesGateway,
    ConversationsRepository,
    MessagesRepository,
    MessagesEventHandler,
    { provide: CONVERSATIONS_REPOSITORY, useExisting: ConversationsRepository },
    { provide: MESSAGES_REPOSITORY, useExisting: MessagesRepository },
  ],
  exports: [MessagesService],
})
export class MessagesModule {}
