import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './services/messages.service.js';
import { MESSAGES_REPOSITORY } from './interfaces/messages-repository.interface.js';
import { MessagesRepository } from './repositories/messages.repository.js';
import { DatabaseModule } from '../../db/database.module.js';
import { EventBusModule } from '../../common/event-bus.module.js';

@Module({
  imports: [DatabaseModule, EventBusModule],
  controllers: [MessagesController],
  providers: [
    MessagesService,
    {
      provide: MESSAGES_REPOSITORY,
      useClass: MessagesRepository,
    },
  ],
  exports: [MessagesService, MESSAGES_REPOSITORY],
})
export class MessagesModule {}
