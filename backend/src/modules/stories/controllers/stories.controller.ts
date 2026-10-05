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
import { ThrottleTier } from '../../../common/decorators/throttle-tier.decorator.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { OptionalJwtAuthGuard } from '../../../common/guards/optional-jwt-auth.guard.ts';
import { OwnershipGuard } from '../../../common/guards/ownership.guard.ts';
import type { AuthRequest } from '../../../common/types/auth-request.interface.ts';
import type { OptionalAuthRequest } from '../../../common/types/optional-auth-request.interface.ts';
import { StoriesService } from '../stories.service.ts';
import { CreateStoryDto, UpdateStoryDto, StoriesQueryDto, MyStoriesQueryDto } from '../dto/stories.dto.ts';
import { PUBLIC_STORY_STATUS } from '../types.ts';

/**
 * `AuthRequest` rather than a local `Request & { user: { sub: string } }`.
 *
 * It is the type `JwtAuthGuard` assigns (`common/types/auth-request.interface.ts`), and it carries the
 * verified `JwtPayload` — `sub`, `accountType`, `adminRole` — which is exactly what
 * `StoryViewer` reads on the two paths below that hand a viewer to the service. A narrower local type
 * would have been a second spelling of "the identity this guard established", and it would have
 * silently dropped the moderation claims the view route now needs.
 */
@Controller('stories')
export class StoriesController {
  constructor(@Inject(StoriesService) private readonly storiesService: StoriesService) {}

  /**
   * The public list, and the one rule that governs it: `status` is PINNED to `published` here and
   * never read from the query string.
   *
   * This route is `@Public()`, and `StoriesRepository.findAll` puts `params.status` straight into
   * `WHERE status = $1`. So `GET /api/v1/stories?status=draft` was an anonymous dump of every
   * draft in the system — title, excerpt and slug for other people's unpublished work — to anyone
   * with no account at all. It is the same leak `GET /search` already closed by pinning the status
   * (`search.controller.ts`), which means the two public read routes disagreed about whether
   * unpublished content is reachable.
   *
   * WHY PIN AND IGNORE RATHER THAN REJECT. One authoritative rule, not two (Principle #9/#16): a
   * public list is an index of published content, so the route decides what it returns and the query
   * string gets no vote. Rejecting `?status=draft` with a 400 would be a second rule — a different
   * answer from the same request depending on which read route the caller picked — and it would buy
   * nothing: the drafts are already unreachable, so the only thing a 400 adds is a way for a caller
   * to distinguish "you may not see drafts" from "there are no drafts". `status` therefore stays on
   * `StoriesQueryDto` for wire compatibility and is simply not forwarded.
   *
   * THE SIDE EFFECT, AND WHERE IT IS NOW SERVED. Pinning this route left an author with no HTTP way to
   * list their own drafts: `POST /stories` answers 201 with the new id and nothing could ever list it
   * again, because `StoriesQueryDto` declares no `authorId` and this module had no authenticated list
   * route. That is a broken feature rather than a design question, and it is served by `GET
   * /stories/mine` below — a route, not a DTO field, because this one is `@Public()` and a field here
   * would re-open the hole. `StoriesQueryDto` stays exactly as it is: no `authorId`, ever.
   */
  @Public()
  @Get()
  async findAll(@Query() query: StoriesQueryDto) {
    return this.storiesService.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      categoryId: query.category,
      status: PUBLIC_STORY_STATUS,
    });
  }

  /**
   * THE AUTHOR'S OWN UNPUBLISHED STORIES — the route that makes a draft reachable again.
   *
   * THE DEFECT THIS CLOSES. Pinning `GET /stories` to `published` (see the handler above) is correct
   * and stays. Its side effect was left unhandled: `POST /stories` returns 201 with the new id, and
   * then nothing could ever list it. `StoriesQueryDto` declares no `authorId` and this module had no
   * authenticated list route, so the capability existed one layer down — `findAll` took `authorId`
   * all along — and was unreachable from HTTP. An author could create a draft and never find it again,
   * which is a broken feature, not a design question.
   *
   * WHY A SEPARATE ROUTE AND NOT `authorId` ON THE PUBLIC LIST. The public list is `@Public()`. An
   * `authorId` query field there is the exact shape of the leak that was just closed: the route hands
   * a caller-supplied identity to `WHERE author_id = $1`, so `?authorId=<uuid>` turns an anonymous
   * endpoint into a draft dump for anyone who can generate a uuid. It can be made safe ONLY by the
   * guard being identity-bound — "take `authorId` from the token or not at all" — and a field that
   * means one thing on an anonymous route and another on an authenticated one is a field whose meaning
   * depends on a decorator three lines above it. A separate route makes the property structural: this
   * one is `JwtAuthGuard`, so there is no anonymous population to protect and the query string cannot
   * name an author at all. `MyStoriesQueryDto` has no `authorId` property, so `?authorId=<someone>` is
   * a 400 from the global pipe's `forbidNonWhitelisted`, not a successful lookup.
   *
   * THE CONTROLLER'S HALF OF THE RULE, WHICH IS ONLY "WHO". `req.user.sub` is the verified subject;
   * nothing else in the handler can widen it. What "unpublished" means, and which statuses a caller
   * may narrow to, is `StoriesService.findUnpublishedByAuthor`'s to decide (Principle #7) — the same
   * split the detail routes already use, and the reason `findAll` was not simply called from here with
   * an `authorId`.
   *
   * WHY `@ThrottleTier` IS DELIBERATELY ABSENT. An undecorated handler falls back to the `default`
   * tier (100/min, tracked per verified account), which is the right budget for one paginated list the
   * author calls when they open their own dashboard. The `search` tier the view counter uses is
   * looser (50/min); borrowing it here would buy nothing, since the rows behind this route are the
   * caller's own and there is no cross-account blast radius to bound.
   */
  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async findMine(@Query() query: MyStoriesQueryDto, @Request() req: AuthRequest) {
    return this.storiesService.findUnpublishedByAuthor(req.user.sub, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      categoryId: query.category,
      status: query.status,
    });
  }

  /**
   * ROUTE ORDER IS LOAD-BEARING — do not move `@Get(':id')` above this handler, and do not move
   * `@Get('mine')` or `@Get('slug/:slug')` below it.
   *
   * Nest registers Express routes in declaration order and Express matches the first pattern that
   * fits, so `@Get(':id')` would happily swallow `/stories/slug/my-story` by binding `id` to the
   * literal string `"slug"` — and then look up a story whose id is `"slug"`, which raises Postgres
   * `22P02 invalid input syntax for type uuid` (swallowed to `null` by `StoriesRepository.findById`)
   * and answers 404 for a story that exists. `/stories/mine` fails the same way, and worse: it would
   * answer 404 for a route that is supposed to work, which reads as "you have no drafts" rather than
   * as a routing mistake. The failure looks exactly like the thing it is not, which is why this
   * ordering is called out here rather than left to be discovered. Every literal segment has to be
   * registered first; only then does `:id` mean "a uuid".
   */
  /**
   * THE UNPUBLISHED-STORY RULE ON THE PUBLIC DETAIL ROUTES.
   *
   * Both detail routes are `@Public()`, and `StoriesService.findBySlug`/`findById` filtered only on
   * `deletedAt`. So `?status=draft` on the list was closed while a draft was still world-readable by
   * id and by slug with no account at all — one rule, two answers (Principle #9/#16), and the detail
   * answer was the wrong one.
   *
   * WHY NOT A BLANKET 404. An author has to be able to load their own draft: the shipped edit page
   * (`frontend/src/app/(app)/stories/[id]/edit/page.tsx`) and the read page read
   * `GET /stories/${id}`, and `POST /stories/:id/publish` / `:id/archive` depend on the same read
   * being possible. Denying every unpublished story would have broken a working feature to close a
   * leak.
   *
   * WHY `OptionalJwtAuthGuard` AND NOT `JwtAuthGuard`. `JwtAuthGuard` is applied per route and
   * returns early on `@Public()`, so on these routes it never populates `request.user` and the
   * handler could not tell "anonymous" from "the author" — it could only guess. The optional guard
   * resolves exactly that distinction: a missing credential stays anonymous, a present one is
   * verified, and a bad one is a 401 rather than a silent downgrade.
   *
   * WHY THE DECISION IS NOT HERE. The controller forwards the identity and nothing else. Whether a
   * viewer may read a non-published story belongs to the service, beside the `deletedAt` check, so
   * every caller of `findById`/`findBySlug` gets the same answer — including a future internal one —
   * and so the two read paths cannot drift apart (Principle #7). The denial is a 404 and not a 403;
   * the reasoning lives with the rule in `story-visibility.ts`.
   */
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string, @Request() req: OptionalAuthRequest) {
    const { response } = await this.storiesService.findBySlugWithRelations(slug, req.user);
    return response;
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: OptionalAuthRequest) {
    const { response } = await this.storiesService.findByIdWithRelations(id, req.user);
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
  async create(@Body() dto: CreateStoryDto, @Request() req: AuthRequest) {
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
  async update(@Param('id') id: string, @Body() dto: UpdateStoryDto, @Request() req: AuthRequest) {
    const story = await this.storiesService.update(id, dto, req.user.sub);
    return this.storiesService.toRecord(story);
  }

  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @Post(':id/publish')
  async publish(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.storiesService.publish(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @Post(':id/archive')
  async archive(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.storiesService.archive(id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Request() req: AuthRequest) {
    await this.storiesService.delete(id, req.user.sub);
  }

  /**
   * `POST /stories/:id/view` — the only HTTP writer of `stories.view_count`.
   *
   * WHY THE ROUTE HAD TO BE ADDED RATHER THAN FIXED. `StoriesService.incrementViewCount` existed,
   * `StoriesRepository.incrementViewCount` existed, the column existed, `deliverables.md` lists view
   * tracking as a shipped Phase 2 deliverable — and nothing outside an e2e test that reached into the
   * service directly ever called any of them. `view_count` was therefore a constant 0 in every real
   * deployment, which also made `sortBy=views` in the search index permanently inert.
   *
   * WHO MAY CALL IT, AND WHY NOT EACH OF THE OTHER TWO ANSWERS.
   *
   * Not the author (`OwnershipGuard` is deliberately absent). The author is the one reader whose view
   * is not evidence of anything, and gating on ownership would make the metric "how often the author
   * reloaded their own page". Worse, it would turn a counter into a privilege: a route whose guard
   * resolves `stories.author_id` makes "who may inflate this number" depend on the row it inflates.
   *
   * Not `@Public()`. `GET /stories/:id` is public, so anonymous reads are real traffic — but this
   * route is a WRITE, and promoting part of the anonymous read population to a writer buys an
   * attacker strictly more damage per request for the same throttle budget. `JwtAuthGuard` is what
   * makes the throttler's tracker resolve to `user:<sub>` instead of degrading to `ip:` (see
   * `common/throttler/throttler-options.ts`), so each account gets its own budget and inflating the
   * counter requires account creation, which is itself rate-limited on the `auth` tier.
   *
   * Why the `search` tier and not `default`: this is the most spam-prone route in the module and
   * `search` is the loosest non-punitive tier (50/min, no block window), so a reader paginating
   * through their own history is never locked out while a flood is still bounded. Principle #15 —
   * bound the abuse at the boundary, before the write, rather than trying to detect it afterwards.
   *
   * WHY 204 AND NO BODY. The write is one `UPDATE`, and re-reading the row to return the new count
   * would make the most frequent request in the module cost two statements. A caller that needs the
   * number reads the story, which is a cache hit anyway.
   *
   * WHY IT TAKES A REQUEST AT ALL — it used to take only `@Param('id')`. Because it answered 204 for
   * any id that existed, it was a draft-existence oracle for every authenticated account: the same
   * class of leak the detail routes were just closed against, reachable for one `POST` and no read.
   * The handler now forwards the verified viewer and `StoriesService.incrementViewCount` runs the one
   * rule — `assertStoryIsReadableBy`, the same helper `findById`/`findBySlug` use — beside its
   * `deletedAt` check. A refusal is the same `Story not found` 404 an id that never existed produces,
   * so this route cannot confirm a draft any more cheaply than the detail route can, and it cannot
   * drift from the detail route the way two separately written rules would (Principle #7/#9).
   *
   * WHAT THAT LEAVES WORKING, deliberately. A published story is readable by anyone, so an ordinary
   * authenticated reader still counts a view on one: that is the normal case, and the check returns
   * before the counter for a published row. The author and a `content:moderate` holder may also count
   * a view on their own unpublished work, because those are exactly the two populations the read rule
   * already admits — nothing here is a new privilege, it is the read rule applied to a write.
   *
   * KNOWN LIMITATION, STATED RATHER THAN PAPERED OVER: a reload counts again, so one reader can
   * inflate a story by refreshing. Deduplicating per (reader, story) needs a sightings table, which
   * is a migration, and Principle #6 forbids one here. The counter is a popularity signal that is
   * already eventually consistent; it is not an audited figure, and this route does not pretend
   * otherwise.
   */
  @ThrottleTier('search')
  @UseGuards(JwtAuthGuard)
  @Post(':id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordView(@Param('id') id: string, @Request() req: AuthRequest): Promise<void> {
    await this.storiesService.incrementViewCount(id, req.user);
  }
}
