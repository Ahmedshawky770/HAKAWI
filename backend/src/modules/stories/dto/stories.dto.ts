import {
  IsString,
  IsOptional,
  IsUUID,
  IsIn,
  ArrayMaxSize,
  ArrayUnique,
  MaxLength,
  MinLength,
  IsBoolean,
  IsInt,
  Min,
  Max,
  Matches,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * WHY a client-supplied slug is capped at the full column width (255) while a *derived* one is
 * capped at `MAX_STORY_SLUG_LENGTH` (100). A client that hands us a slug has made a deliberate
 * choice about its own public URL and the column accepts it; a slug we derive is ours to keep
 * readable and to leave room in for a collision suffix. See `dto/story-slug.ts`.
 */
const STORY_SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * The two tag limits, and why they are what they are (Principle #15 — bound every collection at
 * the boundary, not at the storage layer).
 *
 * `@ArrayMaxSize` exists because a `string[]` is the one field on this DTO with no inherent size:
 * `title` is bounded by `varchar(255)`, `content` by the `text` column, and a tag list is bounded
 * by nothing at all. Without it a single POST can carry an arbitrarily long array of arbitrarily
 * long strings, which is a resource-quota problem, not a validation nicety. Twenty tags is far more
 * than any story needs to be discoverable and small enough that the worst case is cheap to reject.
 *
 * The per-element cap is `tags.name`'s own width — `stories.schema.ts:29` declares
 * `name: varchar('name', { length: 50 })`. Matching the column here means an over-long tag is a
 * 400 with a readable message instead of a driver-level `value too long for type character
 * varying(50)` that surfaces as a 500 and tells the caller nothing.
 */
export const MAX_STORY_TAGS = 20;
export const MAX_STORY_TAG_LENGTH = 50;

/**
 * WHY this exists instead of `@MaxLength(MAX_STORY_TAG_LENGTH, { each: true })`.
 *
 * class-validator's `maxLength` is `typeof value === 'string' && value.length <= max`, so it reports
 * a failure for a NON-string element too. With both `@IsString({ each: true })` and
 * `@MaxLength(..., { each: true })` on `tags`, a client sending `tags: [1]` gets back
 * `["Each tag must not exceed 50 characters", "each value in tags must be a string"]` — and the
 * first message sends them off to shorten a number. A wrong error message costs more at a boundary
 * than a few extra lines, so the length rule stands down for values that are not strings and lets
 * the type rule own that case with an accurate message.
 */
@ValidatorConstraint({ name: 'storyTagLength', async: false })
class StoryTagLengthConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value !== 'string' || value.length <= MAX_STORY_TAG_LENGTH;
  }

  defaultMessage(): string {
    return `Each tag must not exceed ${MAX_STORY_TAG_LENGTH} characters`;
  }
}

const MaxStoryTagLength = (): PropertyDecorator => Validate(StoryTagLengthConstraint, { each: true });

export class CreateStoryDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title: string;

  /**
   * OPTIONAL — and that is the fix for a 400 on every create.
   *
   * It used to be `@MinLength(1, { message: 'Slug is required' })`, which made `POST /stories`
   * unsatisfiable for every client in the repository: no caller sends a slug, so the pipe rejected
   * the request before the handler ran. Requiring a server-derivable value from the client is also
   * backwards (Principle #8): it pushes transliteration and collision handling onto every caller
   * forever, and the server is the only party that can do either consistently.
   *
   * Omit it and `StoriesController.create` derives it from `title` (see `dto/story-slug.ts`).
   * Send it and it is honoured verbatim for backward compatibility, still validated here so it
   * matches the derived shape, and still checked for collisions by the service.
   */
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Slug must not be empty; omit it to have the server derive one from the title' })
  @MaxLength(255, { message: 'Slug must not exceed 255 characters' })
  @Matches(STORY_SLUG_PATTERN, { message: 'Slug can only contain lowercase letters, numbers, and hyphens' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Excerpt must not exceed 500 characters' })
  excerpt?: string;

  /**
   * WHY a cap here when the column is `text` (`stories.schema.ts:53`, effectively unbounded).
   * The 10 MB body limit in `main.ts` is a *transport* limit that applies to every route and every
   * field combined; this is the per-story *domain* limit. Without it `content` is the one field on
   * this DTO that a client can grow without bound in a single request, which is precisely the
   * boundary-validation hole Principle #15 asks us to close. One million characters is roughly a
   * 500 000-word manuscript, so nothing a real story can contain is rejected by it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1_000_000, { message: 'Content must not exceed 1000000 characters' })
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Cover image URL must not exceed 500 characters' })
  coverImage?: string;

  /**
   * `categoryId` and not `category`. A category's human name is a DISPLAY concern — it is localized
   * by the reader, renamed by an admin, and can be duplicated; a mutation input has to name the row
   * it refers to. That is why the FK is the mutation field and why the joined name survives only on
   * the read side (`StoryResponse.category`).
   */
  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  /**
   * WHY `each: true` on every element validator. A per-property class-validator only checks the
   * *property*, so plain `@IsString()` on `tags` asks "is `tags` a string?" — an array is not, so
   * the honest reading is that the whole thing should have been rejected, but what actually
   * happened is that the metadata made it skip and `tags: [1, 2, {}]` sailed through the pipe.
   * `each: true` is what makes the validator run per element, which is the only place a
   * heterogeneous array can be caught.
   *
   * WHY `@ArrayUnique`: `storyTags` has a composite primary key on `(storyId, tagId)`
   * (`stories.schema.ts:86`), so a duplicated tag in one request is a key collision on write.
   * Rejecting it here turns that into a 400 with a message instead of a 500 from the driver.
   */
  @IsOptional()
  @IsString({ each: true })
  @MaxStoryTagLength()
  @ArrayMaxSize(MAX_STORY_TAGS, { message: `A story must not have more than ${MAX_STORY_TAGS} tags` })
  @ArrayUnique({ message: 'Tags must not contain duplicates' })
  tags?: string[];
}

export class UpdateStoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Title must not exceed 255 characters' })
  title?: string;

  /**
   * Same optional contract as on create, and for the same reason: a client may rename its own
   * public URL explicitly, but nothing requires it to.
   *
   * NOTE the deliberate asymmetry with create: changing `title` here does NOT re-derive the slug.
   * A slug is a published identifier — it is already in other people's bookmarks, in search indexes
   * and in inbound links — and silently moving it on a copy edit is a broken-link bug, not a
   * feature. The slug is derived once, at creation, from the title as it was then. To move a URL
   * the client sends an explicit `slug`, which is a decision it can make knowingly.
   */
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Slug must not be empty; omit it to keep the current slug' })
  @MaxLength(255, { message: 'Slug must not exceed 255 characters' })
  @Matches(STORY_SLUG_PATTERN, { message: 'Slug can only contain lowercase letters, numbers, and hyphens' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Excerpt must not exceed 500 characters' })
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1_000_000, { message: 'Content must not exceed 1000000 characters' })
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Cover image URL must not exceed 500 characters' })
  coverImage?: string;

  // `status` is DELIBERATELY NOT ON THIS DTO, and `forbidNonWhitelisted` turns its absence into a
  // 400. It used to be accepted here, and that made `PATCH /stories/:id {"status":"published"}` a
  // complete bypass of the publishing workflow:
  //
  //   - `published_at` stayed NULL, because only `StoriesService.publish` sets it;
  //   - no `story.published` event was emitted, so the Sanity sync, the search-cache invalidation,
  //     the badge award and the content moderation pass all silently did not run;
  //   - and the story was then unrecoverable, because `POST /stories/:id/publish` rejects with
  //     "Story is already published".
  //
  // The lifecycle is reachable through `POST /stories/:id/publish` and `POST /stories/:id/archive`,
  // which are the only two transitions that set `published_at` and emit the matching event. Leaving
  // a narrow `PATCH /stories/:id/status` alias out of scope is better than adding a second door to
  // the same state machine.

  @IsOptional()
  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  categoryId?: string;

  /**
   * `tags` was missing here, which made `PATCH /stories/:id` a 400 for exactly the clients that use
   * it — the edit form in `frontend/src/app/(app)/stories/[id]/edit/page.tsx:50-58` sends a tag
   * list on every save. Accepting it is required for the contract to be faithful; see the note in
   * `StoriesController.update` about what is and is not persisted today.
   */
  @IsOptional()
  @IsString({ each: true })
  @MaxStoryTagLength()
  @ArrayMaxSize(MAX_STORY_TAGS, { message: `A story must not have more than ${MAX_STORY_TAGS} tags` })
  @ArrayUnique({ message: 'Tags must not contain duplicates' })
  tags?: string[];
}

export class PublishStoryDto {
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class StoriesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
