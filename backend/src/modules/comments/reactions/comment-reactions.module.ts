import { Module, forwardRef } from '@nestjs/common';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { DatabaseModule } from '../../../db/database.module.ts';
import { CommonModule } from '../../../common/common.module.ts';
import { CommentsModule } from '../comments.module.ts';
import { COMMENT_REACTIONS_REPOSITORY } from '../interfaces/comments-repository.interface.ts';

import { CommentReactionsService } from './comment-reactions.service.ts';
import { CommentReactionsController } from './comment-reactions.controller.ts';
import { CommentReactionsRepository } from './comment-reactions.repository.ts';

@Module({
  imports: [CommonModule, DatabaseModule, forwardRef(() => CommentsModule)],
  controllers: [CommentReactionsController],
  providers: [CommentReactionsService, CommentReactionsRepository, { provide: COMMENT_REACTIONS_REPOSITORY, useExisting: CommentReactionsRepository }],
  exports: [CommentReactionsService],
})
export class CommentReactionsModule {}
