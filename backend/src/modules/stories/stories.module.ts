import { Module } from '@nestjs/common';

import { CommonModule } from '../../common/common.module.ts';
import { OWNERSHIP_RESOLVER } from '../../common/guards/ownership.guard.ts';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard.ts';
import { DatabaseModule } from '../../db/database.module.ts';
import { CategoriesModule } from '../categories/categories.module.ts';
import { TagsModule } from '../tags/tags.module.ts';

import { StoriesService } from './stories.service.ts';
import { StoriesController } from './controllers/stories.controller.ts';
import { StoriesRepository } from './repositories/stories.repository.ts';
import { StoriesEventHandler } from './events/stories.event-handler.ts';
import { SanitySyncEventHandler } from './sanity/sanity-sync.event-handler.ts';
import { SanityService } from './sanity/sanity.service.ts';
import { StoryOwnershipResolver } from './story-ownership.resolver.ts';
import { STORIES_REPOSITORY } from './interfaces/stories-repository.interface.ts';

@Module({
  imports: [CommonModule, DatabaseModule, CategoriesModule, TagsModule],
  controllers: [StoriesController],
  providers: [
    StoriesService,
    StoriesRepository,
    StoriesEventHandler,
    SanitySyncEventHandler,
    SanityService,
    StoryOwnershipResolver,
    // `@UseGuards(OptionalJwtAuthGuard)` on the two public detail routes needs the guard resolvable
    // from the module that declares the controller. It is NOT exported: no other module has a
    // public-but-identity-sensitive route today, and `@Public()` returns early inside `JwtAuthGuard`
    // anyway, so promoting it to the shared guard list would make it available to routes that would
    // not know what to do with it.
    OptionalJwtAuthGuard,
    { provide: STORIES_REPOSITORY, useExisting: StoriesRepository },
    // Module-scoped binding for the single `OWNERSHIP_RESOLVER` token; see the same binding in
    // `CommentsModule` for why `useExisting` is the right alias here.
    { provide: OWNERSHIP_RESOLVER, useExisting: StoryOwnershipResolver },
  ],
  // Exported so another module can resolve a story author through this module's own interface rather
  // than reading the `stories` table directly. `CommentsModule` already exports
  // `COMMENTS_REPOSITORY` for the same reason (Principle #7: modules communicate via interfaces).
  exports: [StoriesService, STORIES_REPOSITORY],
})
export class StoriesModule {}
