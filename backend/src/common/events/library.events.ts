export class LibraryItemAddedEvent {
  constructor(public readonly libraryItemId: string, public readonly userId: string, public readonly bookId: string) {}
}

export class LibraryItemAccessedEvent {
  constructor(public readonly libraryItemId: string, public readonly userId: string) {}
}

export class LibraryItemRemovedEvent {
  constructor(public readonly libraryItemId: string, public readonly userId: string) {}
}
