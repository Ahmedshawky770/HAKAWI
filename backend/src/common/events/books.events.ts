export class BookCreatedEvent {
  constructor(public readonly bookId: string, public readonly userId: string) {}
}

export class BookUpdatedEvent {
  constructor(public readonly bookId: string, public readonly updatedFields: Record<string, unknown>) {}
}

export class BookPublishedEvent {
  constructor(public readonly bookId: string, public readonly publishedAt: Date) {}
}

export class BookArchivedEvent {
  constructor(public readonly bookId: string) {}
}

export class BookDeletedEvent {
  constructor(public readonly bookId: string, public readonly userId: string) {}
}
