export class UserRegisteredEvent {
  constructor(public readonly userId: string, public readonly email: string, public readonly name: string) {}
}

export class UserUpdatedEvent {
  constructor(public readonly userId: string, public readonly updatedFields: Record<string, unknown>) {}
}
