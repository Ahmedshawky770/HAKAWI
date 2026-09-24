export class RentalCreatedEvent {
  constructor(public readonly rentalId: string, public readonly userId: string, public readonly bookId: string) {}
}

export class RentalExtendedEvent {
  constructor(public readonly rentalId: string) {}
}

export class RentalReturnedEvent {
  constructor(public readonly rentalId: string) {}
}

export class RentalExpiredEvent {
  constructor(public readonly rentalId: string) {}
}
