export class ModerationActionTakenEvent {
  constructor(
    public readonly actionId: string,
    public readonly reportId: string,
    public readonly adminId: string,
    public readonly targetUserId: string,
    public readonly action: string,
    public readonly reason: string,
  ) {}
}

export class ModerationReportEscalatedEvent {
  constructor(
    public readonly reportId: string,
    public readonly targetId: string,
    public readonly previousStatus: string,
    public readonly previousUpdatedAt: Date,
  ) {}
}
