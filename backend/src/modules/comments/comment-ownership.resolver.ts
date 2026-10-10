import { Injectable, Inject } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { AuthRequest } from '../../common/types/auth-request.interface.ts';
import type { OwnershipResolver } from '../../common/guards/ownership.guard.ts';

import { COMMENTS_REPOSITORY } from './interfaces/comments-repository.interface.ts';
import type { ICommentsRepository } from './interfaces/comments-repository.interface.ts';

/**
 * Reads the addressed comment's `authorId` out of the route parameter.
 *
 * WHY `unknown` and manual narrowing instead of `request.params.id`: a guard runs on data that no
 * DTO validated. A route declared `PATCH /comments` with no `:id`, or a framework that leaves
 * `params` unpopulated, must produce "no owner found" — a denial — rather than an exception that
 * the guard's `catch` turns into the less specific `Ownership could not be verified`. Keeping the
 * two failures distinguishable is what lets an operator tell a wiring mistake from a hostile request.
 */
const addressedCommentId = (request: AuthRequest): string | null => {
  const params: unknown = request.params;
  if (typeof params !== 'object' || params === null || !('id' in params) || typeof params.id !== 'string') {
    return null;
  }
  return params.id;
};

/**
 * Ownership lookup for the comments resource, bound to `OWNERSHIP_RESOLVER` in `CommentsModule`.
 *
 * WHY this class exists at all, rather than `CommentsService` being provided directly: the service
 * enforces ownership *inside* `update`/`delete`, after it has already loaded the row, and it answers
 * with a `NotFoundException` when the id is unknown. A guard needs the inverse shape — a value, not
 * a verdict — and it needs it before the handler runs. Implementing `OwnershipResolver` here gives
 * the guard one narrow, total function to call.
 *
 * The lookup goes through `COMMENTS_REPOSITORY`, the module's own interface (Principle #7): no
 * controller-side query, no import of the comments table from outside the module.
 *
 * ## Fail-closed contract
 *
 * `null` is returned — and the guard denies — for all four cases: no `:id` on the route, a comment
 * that does not exist, a soft-deleted comment, and a row with no author (impossible via the schema,
 * but the type allows it). `OwnershipGuard` converts every one of them into 403, so a 403 on
 * `PATCH`/`DELETE /comments/:id` means either "not yours" or "not there", which is also what
 * keeps the route from confirming whether a given comment id exists.
 */
@Injectable()
export class CommentOwnershipResolver implements OwnershipResolver {
  constructor(
    @Inject(COMMENTS_REPOSITORY) private readonly commentsRepository: ICommentsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  async resolveOwnerId(request: AuthRequest): Promise<string | null> {
    const commentId = addressedCommentId(request);
    if (commentId === null) {
      this.logger.warn('Ownership check on a comment route with no :id parameter', 'CommentOwnership');
      return null;
    }

    const comment = await this.commentsRepository.findById(commentId);
    if (comment === null || comment === undefined) {
      this.logger.debug(`No comment ${commentId} to resolve ownership for`, 'CommentOwnership');
      return null;
    }

    // A soft-deleted comment is a tombstone: `CommentsService.update`/`delete` both refuse it, so
    // resolving its author would hand the guard an owner for a row no caller may act on.
    if (comment.isDeleted) {
      return null;
    }

    return comment.authorId;
  }
}
