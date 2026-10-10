/**
 * The story row carried alongside the id on the three events a Sanity document is derived from.
 *
 * WHY THE SNAPSHOT EXISTS. `SanitySyncEventHandler` needs the whole document to build a Sanity
 * record, and it was reading it off the event as `event.story` — but no producer ever set that
 * field, so all three handlers returned on `if (!story)`. The Sanity client, the Zod validation, the
 * circuit breaker and the `isEnabled()` gate were all real and all reachable, and the sync still
 * never ran once. A client that is wired but never called looks identical to a client that works.
 *
 * WHY IT IS OPTIONAL IN THE SCHEMA AND NOT REQUIRED. Three reasons, and they are different:
 *
 *  - `story.updated` and `story.created` have subscribers that do not need it, and making a
 *    required field would force every one of them to fetch a row they ignore.
 *  - The dead-letter queue persists payloads, so a replayed old event predates this field entirely.
 *    A required field would make every historical DLQ entry permanently unreplayable.
 *  - `z.object()` is non-strict, so an extra key validates cleanly whether or not it is declared.
 *    Declaring it makes the contract visible; not requiring it keeps the two cases above working.
 *
 * THE REAL FIX IS AT THE PRODUCE SITE. The schema tolerates a missing snapshot so old and
 * third-party emitters keep working; `stories.service.ts` is what must actually set it, and
 * `sanity-sync.event-handler.spec.ts` is what fails if it stops.
 */
export class StorySnapshot {
  constructor(
    public readonly id: string,
    public readonly authorId: string,
    public readonly title: string,
    public readonly slug: string,
    public readonly excerpt: string | null,
    public readonly content: string | null,
    public readonly coverImage: string | null,
    public readonly status: string,
    public readonly publishedAt: Date | null,
  ) {}
}

export class StoryCreatedEvent {
  constructor(
    public readonly storyId: string,
    public readonly authorId: string,
    public readonly story?: StorySnapshot,
  ) {}
}

export class StoryUpdatedEvent {
  constructor(
    public readonly storyId: string,
    public readonly updatedFields: Record<string, unknown>,
    public readonly story?: StorySnapshot,
  ) {}
}

export class StoryPublishedEvent {
  constructor(
    public readonly storyId: string,
    public readonly publishedAt: Date,
    public readonly story?: StorySnapshot,
  ) {}
}

export class StoryArchivedEvent {
  constructor(
    public readonly storyId: string,
    public readonly story?: StorySnapshot,
  ) {}
}

export class StoryDeletedEvent {
  constructor(
    public readonly storyId: string,
    public readonly authorId: string,
  ) {}
}
