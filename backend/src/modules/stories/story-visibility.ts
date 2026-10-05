import { NotFoundException } from '@nestjs/common';

import { Permission, resolvePermissions } from '../../common/permissions/permissions.ts';

import { PUBLIC_STORY_STATUS } from './types.ts';
import type { Story } from './types.ts';

/**
 * Who is asking for a story. Deliberately narrower than `JwtPayload`: this rule needs the subject
 * id and the authority claims, and nothing else, so the service depends on the two facts it reads
 * rather than on the shape of a login token (Principle #8 — a narrow input is easier to satisfy
 * honestly than a wide one). `JwtPayload` satisfies it structurally, so the controller forwards the
 * verified claims without reshaping them.
 */
export interface StoryViewer {
  readonly sub: string;
  readonly accountType?: string;
  readonly adminRole?: string;
}

/**
 * Whether this caller holds content-moderation authority over unpublished work.
 *
 * WHY IT IS `CONTENT_MODERATE` AND NOT A LIST OF ROLES. `resolvePermissions` reads
 * `PERMISSIONS_BY_ACCOUNT_TYPE` and `PERMISSIONS_BY_ROLE`, so the answer here is the SAME one
 * `PermissionsGuard` computes for every `@Secured` route: `content:moderate` is held by an
 * `admin` account type and by the `content_moderator` role, and by nothing else. Spelling out
 * `'admin' === accountType || adminRole === 'content_moderator'` here would create a parallel role
 * list that could fall behind the table without any test noticing — one rule, two answers, which is
 * the same defect this change exists to close (Principle #9).
 */
export function canModerateUnpublishedStories(viewer: StoryViewer): boolean {
  return resolvePermissions({ accountType: viewer.accountType, adminRole: viewer.adminRole }).has(
    Permission.CONTENT_MODERATE,
  );
}

/**
 * Whether `viewer` may read a story that is not published.
 *
 * A missing viewer is a missing viewer, not a wildcard: the parameter is `undefined` for an
 * anonymous request and is never defaulted to "everyone can see unpublished work".
 */
export function canReadUnpublishedStory(story: Story, viewer: StoryViewer | undefined): boolean {
  if (viewer === undefined) {
    return false;
  }
  return viewer.sub === story.authorId || canModerateUnpublishedStories(viewer);
}

/**
 * The single allow/deny rule for reading a story by id or by slug, thrown rather than returned.
 *
 * WHY ONE FUNCTION FOR BOTH READ PATHS. `findById` and `findBySlug` are two code paths over one
 * rule. They were written as two literal `deletedAt` checks, and when the status rule was added to
 * one of them the other would have kept serving drafts — which is precisely what happened here, and
 * the same shape of drift the comments module already closed with `visibleTopLevel`. Throwing from a
 * helper makes the rule one expression that both call sites cannot phrase differently.
 *
 * WHY 404 AND NOT 403. A 403 would answer the question the caller actually asked — "is there a draft
 * at this id?" — with "yes, and you may not have it". That is a working oracle for enumerating
 * unpublished work: anyone who can generate slugs could distinguish a draft that exists from one
 * that does not, from the status code alone, with no account and no rate limit. A 404 is the answer
 * the caller would have received for an id that never existed, so the response carries no
 * information beyond "not for you". The author's own read still succeeds, so the legitimate caller is
 * not made to pay for the concealment.
 */
export function assertStoryIsReadableBy(story: Story, viewer: StoryViewer | undefined): void {
  if (story.status === PUBLIC_STORY_STATUS) {
    return;
  }

  if (!canReadUnpublishedStory(story, viewer)) {
    // Same message and same exception as a story that does not exist, on purpose: the two answers
    // must be byte-identical, or the status code becomes the oracle the paragraph above rules out.
    throw new NotFoundException('Story not found');
  }
}
