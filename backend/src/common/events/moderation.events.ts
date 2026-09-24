import { z } from 'zod';

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

export class UserRestrictedEvent {
  constructor(
    public readonly userId: string,
    public readonly type: string,
    public readonly reason: string,
    public readonly restrictedBy: string,
    public readonly expiresAt: Date | null,
  ) {}
}
