export class ModerationActionTakenEvent {
  /**
   * `durationMinutes` is carried because the enforcement cache has to expire on the same clock the
   * stored row does. `ModerationService` used to emit the action without it, so the handler had
   * nothing to enforce but the action name and fell back to a fixed TTL — a seven-day ban lifted
   * after a day. `null` means the moderator chose no duration, which the shared policy turns into
   * the action's default TTL rather than into a permanent restriction.
   */
  constructor(
    public readonly actionId: string,
    public readonly reportId: string,
    public readonly adminId: string,
    public readonly targetUserId: string,
    public readonly action: string,
    public readonly reason: string,
    public readonly durationMinutes: number | null,
  ) {}
}

/**
 * A moderator removed one piece of REPORTED content, and the owning module must apply it.
 *
 * WHY THIS EVENT EXISTS. `ModerationService.takeAction` recorded a `content_removal` action, wrote
 * the audit row and emitted `moderation.action.taken` — and then nothing happened to the content.
 * `restriction-policy.ts` deliberately maps only `ban`/`mute` to account restrictions, so the
 * enforcement cache was correctly left untouched for `content_removal`; the gap was that no other
 * path removed the story or comment either, and the delete routes are
 * `JwtAuthGuard + OwnershipGuard`, so a moderator had no HTTP way to take the content down. An
 * admin who chose "remove this" believed the offending post was gone while it stayed live for every
 * reader. This event is the missing link: it is what turns the recorded decision into a write on
 * the content itself.
 *
 * WHY IT DOES NOT CARRY A FULL SNAPSHOT OF THE CONTENT. The report already names the target, and
 * each consumer reads the row through its OWN repository before deleting it, which is what makes
 * the removal idempotent and what lets the consumer refuse a target that has since been deleted.
 * Carrying a snapshot would duplicate state the producing module has no business owning
 * (Principle #9), and a stale copy could delete the wrong row.
 *
 * WHY THE TARGET TYPE IS ON THE PAYLOAD. One event serves both owning modules, and each consumer
 * filters on `targetType` to decide whether the fact is its own. That is the same arrangement
 * `payment.completed` uses between the rentals and library consumers: both subscribe, each filters
 * on the metadata it owns, and neither has to know the other exists (Principle #7).
 *
 * `reason` is carried because the consuming modules log what they removed and why, and reading
 * `moderation_actions` back from inside the stories module would be a cross-module read for a log
 * line. `adminId` and `reportId` make the log traceable to the audit trail.
 */
export class ModerationContentRemovedEvent {
  constructor(
    public readonly reportId: string,
    public readonly targetType: string,
    public readonly targetId: string,
    public readonly adminId: string,
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
