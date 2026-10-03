import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';

import { Public } from '../../../common/decorators/roles.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { OwnershipGuard } from '../../../common/guards/ownership.guard.ts';
import { StoriesService } from '../stories.service.ts';
import { CreateStoryDto, UpdateStoryDto, StoriesQueryDto } from '../dto/stories.dto.ts';

type AuthenticatedRequest = Request & { user: { sub: string } };

@Controller('stories')
export class StoriesController {
  constructor(@Inject(StoriesService) private readonly storiesService: StoriesService) {}

  @Public()
  @Get()
  async findAll(@Query() query: StoriesQueryDto) {
    return this.storiesService.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      categoryId: query.category,
      status: query.status,
    });
  }

  /**
   * ROUTE ORDER IS LOAD-BEARING — do not move `@Get(':id')` above this handler.
   *
   * Nest registers Express routes in declaration order and Express matches the first pattern that
   * fits, so `@Get(':id')` would happily swallow `/stories/slug/my-story` by binding `id` to the
   * literal string `"slug"` — and then look up a story whose id is `"slug"`, which raises Postgres
   * `22P02 invalid input syntax for type uuid` (swallowed to `null` by `StoriesRepository.findById`)
   * and answers 404 for a story that exists. The failure looks exactly like a missing story, which
   * is why this ordering is called out here rather than left to be discovered. The literal segment
   * has to be registered first; only then does `:id` mean "a uuid".
   */
  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const { response } = await this.storiesService.findBySlugWithRelations(slug);
    return response;
  }

  @Public()
  @Get(':id')
  async findById(@Param('id') id: string) {
    const { response } = await this.storiesService.findByIdWithRelations(id);
    return response;
  }

  /**
   * RESPONSE MAPPER — `toRecord`, deliberately, and here is the decision the previous audit asked for.
   *
   * `toStoryResponse` (the public wire shape) hides `authorId`, `categoryId`, `readingTime`,
   * `viewCount`, `likeCount`, `commentCount` and `deletedAt` because a reader browsing the site
   * needs none of them. `toRecord` returns all of them. The temptation is to call that an
   * information leak. It is not, here, for four reasons that each have to hold independently:
   *
   * 1. **Audience.** Both write routes are behind `JwtAuthGuard` and are scoped to the author (the
   *    service rejects anyone else with a 403). The caller is the story's own author, for whom
   *    `authorId` is a constant they already sent and the counters are their own numbers.
   * 2. **Necessity, not convenience.** The author genuinely needs `slug` to build the public URL,
   *    `authorId` to confirm the write landed on their own account, and the counters to render the
   *    story immediately after publishing without a follow-up read. `toStoryResponse` would force
   *    the client to issue a second request to learn the slug it is about to link to.
   * 3. **Nothing here is secret.** `deletedAt` is the one field that reads like an internal, and on
   *    a create/update response it is structurally always `null` — soft delete is a separate route.
   *    So it leaks no information at all.
   * 4. **Contract stability.** `StoryRecord` is the published shared type, the frontend's
   *    `storyRecordResponseSchema` requires every one of these keys (`frontend/src/lib/schemas.ts:113-132`),
   *    and the e2e suite asserts `viewCount`, `publishedAt` and `authorId` on the create response.
   *    Switching to `toStoryResponse` would be a breaking API change, not a security fix.
   *
   * So the two mappers stay, and the boundary that matters is the one that already exists: reads go
   * through `toStoryResponse`, writes go through `toRecord`, and only the latter is reachable by the
   * author.
   *
   * The DTO is forwarded verbatim, `slug` included and `undefined` included — deriving it is
   * `StoriesService.create`'s job, because that is the layer that owns the insert and can therefore
   * tell whether a candidate slug was really free. Doing it here would have meant the controller
   * probing for a slug it could not write.
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateStoryDto, @Request() req: AuthenticatedRequest) {
    const story = await this.storiesService.create(req.user.sub, { ...dto, authorId: req.user.sub });
    return this.storiesService.toRecord(story);
  }

  /**
   * `dto` is forwarded as-is, with no slug handling here, and that is deliberate on two counts:
   *
   * 1. A title change does NOT re-derive the slug. The slug is a published identifier already
   *    sitting in bookmarks, search indexes and inbound links; moving it on a copy edit is a
   *    broken-link bug. Derivation happens once, at creation.
   * 2. A client-supplied `slug` still goes straight through, and a collision is still a 409 from
   *    `StoriesService.update`. Rewriting a slug the client chose would mean the client believes it
   *    published at `/my-story` while the row says `my-story-2` — two truths about one URL
   *    (Principle #9). Better to refuse and let the caller pick.
   *
   * `tags` is persisted. It used to be accepted here and dropped on the floor: the `stories` table
   * has no `tags` column (it is the `story_tags` join) and `StoriesRepository` had no writer for it,
   * so Drizzle discarded the key on both the insert and the update while the API answered 200. It is
   * now written by `StoriesRepository.replaceTags` from `StoriesService.create/update`. Omitting the
   * field leaves the current set alone; sending `[]` clears it; an unknown name is a 400, because a
   * silently ignored tag is indistinguishable from a saved one to the caller.
   */
  /**
   * AUTHOR-SCOPED WRITE ROUTES — `OwnershipGuard` is listed on each of them.
   *
   * `JwtAuthGuard` runs first because `OwnershipGuard` reads `request.user.sub` and denies when it is
   * absent; the order in the array is the order Nest runs them in.
   *
   * WHY the guard, given that `StoriesService.update`/`publish`/`archive`/`delete` all already
   * compare `story.authorId` against the caller. The in-service check is the one that has been
   * there, and it is a real defence, but it happens after the row has been loaded and after the
   * request has been accepted: it is invisible to anyone auditing which routes are ownership-gated,
   * and it is one forgotten argument away from being removed. `OwnershipGuard` makes the property
   * declarative — the route says it requires ownership — and it resolves the author from the
   * repository before the handler runs, so a non-owner never reaches the service at all.
   *
   * `POST /stories` is deliberately NOT gated: there is no resource yet, so there is nothing to own.
   */
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateStoryDto, @Request() req: AuthenticatedRequest) {
    const story = await this.storiesService.update(id, dto, req.user.sub);
    return this.storiesService.toRecord(story);
  }

  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @Post(':id/publish')
  async publish(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.storiesService.publish(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @Post(':id/archive')
  async archive(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.storiesService.archive(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    await this.storiesService.delete(id, req.user.sub);
  }
}
