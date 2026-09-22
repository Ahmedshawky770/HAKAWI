import { Module } from '@nestjs/common';
import { MessagesService } from './services/messages.service.js';
import { MessagesController } from './controllers/messages.controller.js';
import { MessagesRepository } from './repositories/messages.repository.js';

@Module({
  imports: [],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesRepository],
  exports: [MessagesService],
})
export class MessagesModule {}
