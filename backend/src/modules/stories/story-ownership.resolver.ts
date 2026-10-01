import { Injectable, Inject } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { AuthRequest } from '../../common/types/auth-request.interface.ts';
import type { OwnershipResolver } from '../../common/guards/ownership.guard.ts';

import { STORIES_REPOSITORY } from './interfaces/stories-repository.interface.ts';
import type { IStoriesRepository } from './interfaces/stories-repository.interface.ts';

/**
 * Reads the addressed story's id out of the route parameter.
 *
 * WHY not `request.params.id`: the guard runs before the handler and outside the pipe, so `:id` is
 * whatever the route matched — including the literal `slug` segment that `@Get('slug/:slug')` wins
 * by declaration order. Returning `null` for anything that is not a string makes the guard deny
 * rather than look up a story whose id is `"slug"`.
 */
const addressedStoryId = (request: AuthRequest): string | null => {
  const params: unknown = request.params;
  if (typeof params !== 'object' || params === null || !('id' in params) || typeof params.id !== 'string') {
    return null;
  }
  return params.id;
};

/**
 * Ownership lookup for the stories resource, bound to `OWNERSHIP_RESOLVER` in `StoriesModule`.
 *
 * ## Why the repository and not `StoriesService.findById`
 *
 * `StoriesService.findById` is the cached read: it goes through `TaggedCacheService`, and that cache
 * is documented as fail-open — on a Valkey error it serves the loader's result and on a hit it
 * answers from Valkey rather than Postgres. That is the right trade for a page a reader is about to
 * see, and the wrong trade for the one input that decides who may delete a story. An authorization
 * decision should be made from the authoritative row every time, so this resolver reads
 * `STORIES_REPOSITORY` directly. It also throws `NotFoundException` rather than returning `null`,
 * which a guard cannot act on; the guard needs a value.
 *
 * `STORIES_REPOSITORY` is the module's own interface (Principle #7), so no controller and no other
 * module touches the `stories` table to make this decision.
 *
 * ## Fail-closed contract
 *
 * `null` — and therefore a 403 — for: no `:id` on the route, a story that does not exist, and a
 * soft-deleted story (`deletedAt` set). The last one matters because `StoriesService.update`,
 * `publish`, `archive` and `delete` all refuse a deleted row; resolving its author would hand the
 * guard an owner for something no caller may act on.
 */
@Injectable()
export class StoryOwnershipResolver implements OwnershipResolver {
  constructor(
    @Inject(STORIES_REPOSITORY) private readonly storiesRepository: IStoriesRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  async resolveOwnerId(request: AuthRequest): Promise<string | null> {
    const storyId = addressedStoryId(request);
    if (storyId === null) {
      this.logger.warn('Ownership check on a story route with no :id parameter', 'StoryOwnership');
      return null;
    }

    // A non-uuid `:id` is swallowed to `null` by `StoriesRepository.findById` (SQLSTATE 22P02), so a
    // malformed path denies here instead of surfacing a Postgres error as a 500.
    const story = await this.storiesRepository.findById(storyId);
    if (story === null || story === undefined) {
      this.logger.debug(`No story ${storyId} to resolve ownership for`, 'StoryOwnership');
      return null;
    }

    if (story.deletedAt !== null) {
      return null;
    }

    return story.authorId;
  }
}
