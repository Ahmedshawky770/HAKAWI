import { Module, forwardRef } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { CommonModule } from '../../common/common.module.ts';

import { CommentsService } from './comments.service.ts';
import { CommentsController } from './controllers/comments.controller.ts';
import { CommentsRepository } from './repositories/comments.repository.ts';
import { COMMENTS_REPOSITORY } from './interfaces/comments-repository.interface.ts';
import { CommentsEventHandler } from './events/comments.event-handler.ts';
import { CommentReactionsModule } from './reactions/comment-reactions.module.ts';

@Module({
  imports: [CommonModule, DatabaseModule, forwardRef(() => CommentReactionsModule)],
  controllers: [CommentsController],
  providers: [CommentsService, CommentsRepository, CommentsEventHandler, { provide: COMMENTS_REPOSITORY, useExisting: CommentsRepository }],
  exports: [CommentsService, CommentReactionsModule, COMMENTS_REPOSITORY],
})
export class CommentsModule {}
