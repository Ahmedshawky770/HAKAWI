export class StoryCreatedEvent {
  constructor(public readonly storyId: string, public readonly authorId: string) {}
}

export class StoryUpdatedEvent {
  constructor(public readonly storyId: string, public readonly updatedFields: Record<string, unknown>) {}
}

export class StoryPublishedEvent {
  constructor(public readonly storyId: string, public readonly publishedAt: Date) {}
}

export class StoryArchivedEvent {
  constructor(public readonly storyId: string) {}
}

export class StoryDeletedEvent {
  constructor(public readonly storyId: string, public readonly authorId: string) {}
}
