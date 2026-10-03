import { Module, forwardRef } from '@nestjs/common';

import { DatabaseModule } from '../../db/database.module.ts';
import { CommonModule } from '../../common/common.module.ts';
import { OWNERSHIP_RESOLVER } from '../../common/guards/ownership.guard.ts';

import { CommentsService } from './comments.service.ts';
import { CommentsController } from './controllers/comments.controller.ts';
import { CommentsRepository } from './repositories/comments.repository.ts';
import { COMMENTS_REPOSITORY } from './interfaces/comments-repository.interface.ts';
import { CommentOwnershipResolver } from './comment-ownership.resolver.ts';
import { CommentsEventHandler } from './events/comments.event-handler.ts';
import { CommentReactionsModule } from './reactions/comment-reactions.module.ts';

@Module({
  imports: [CommonModule, DatabaseModule, forwardRef(() => CommentReactionsModule)],
  controllers: [CommentsController],
  providers: [
    CommentsService,
    CommentsRepository,
    CommentsEventHandler,
    CommentOwnershipResolver,
    { provide: COMMENTS_REPOSITORY, useExisting: CommentsRepository },
    // `useExisting`, not `useClass`: the guard receives the same singleton the rest of the module
    // sees. `OWNERSHIP_RESOLVER` is a single token, so this binding is scoped to this module's
    // injector — which is why a module that owns its own table must own its own resolver too.
    { provide: OWNERSHIP_RESOLVER, useExisting: CommentOwnershipResolver },
  ],
  exports: [CommentsService, CommentReactionsModule, COMMENTS_REPOSITORY],
})
export class CommentsModule {}
