/**
 * The events the admin module emits about PRIVILEGED ACCESS.
 *
 * WHY THESE THREE EXIST AS A GROUP. Assigning a role, revoking one and
 * breaking the glass are the three moments at which a person is GIVEN POWER
 * over the platform, and they are the three moments an operator asks about
 * afterwards: who gave this account moderation powers, when, and why. The
 * module writes an audit row for each of them, and these events are the same
 * fact made AMBULATORY — something another part of the system can watch, alert
 * on, or forward to a log the deployment owns.
 *
 * WHY THEY WERE NOT DELIVERED BEFORE. `AdminRolesService` emitted all three
 * through `EventValidatorService`, which validates every payload against
 * `EVENT_SCHEMAS` and REFUSES to deliver a name that is not registered there:
 * an unregistered payload is written to the dead-letter queue and the event
 * never reaches a subscriber. These three names were not registered, so every
 * role assignment, every revocation and every break-glass had been dead-lettered
 * instead of emitted. The audit row was written, the reader's role was changed,
 * and the event was quietly lost — the failure this file's schemas close.
 */

/**
 * A role was granted to an account.
 *
 * `assignedBy` is the ADMIN who granted it and `reason` is the justification
 * they recorded: a grant of power is only auditable if both are on the event,
 * because the grant itself does not say who thought it was a good idea.
 *
 * `expiresAt` is the moment the role stops being in force. It is an ISO
 * STRING on the wire and not a `Date`, because the payload travels through
 * JSON — to the dead-letter queue, to another process, to a replay — and a
 * `Date` comes back as a string on the other side. The schema accepts both.
 */
export class AdminRoleAssignedEvent {
  constructor(
    public readonly userId: string,
    public readonly adminRole: string,
    public readonly assignedBy: string,
    public readonly reason: string,
    public readonly expiresAt: string | null,
  ) {}
}

/**
 * A role was taken back from an account.
 *
 * `revokedBy` is the admin who took it back, and `reason` is why. A
 * revocation is the more important of the two events to have a reason on: it
 * is the one an operator asks about when an account behaves badly AFTER the
 * role was taken away.
 */
export class AdminRoleRevokedEvent {
  constructor(
    public readonly userId: string,
    public readonly adminRole: string,
    public readonly revokedBy: string,
    public readonly reason: string,
  ) {}
}

/**
 * An account BROKE THE GLASS: a role it does not normally hold was granted to
 * it for a short window.
 *
 * The break-glass path exists so an administrator can act during an incident
 * without waiting for a role to be assigned through the normal route. That is
 * exactly why the event carries `durationMinutes` and `expiresAt` SEPARATELY:
 * the window is short by design, and a consumer that only knows "the role is
 * in force" would keep enforcing a break-glass grant for as long as an
 * ordinary grant lasts.
 *
 * `invokedBy` is the account that broke the glass, which is the account that
 * RECEIVED the role — a break-glass is self-service, and the two being the
 * same is the point of the flow rather than an accident.
 */
export class AdminRoleBreakGlassEvent {
  constructor(
    public readonly userId: string,
    public readonly adminRole: string,
    public readonly invokedBy: string,
    public readonly reason: string,
    public readonly expiresAt: string,
    public readonly durationMinutes: number,
  ) {}
}
