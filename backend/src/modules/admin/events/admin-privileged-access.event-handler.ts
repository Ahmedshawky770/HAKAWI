import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  AdminRoleAssignedEvent,
  AdminRoleRevokedEvent,
  AdminRoleBreakGlassEvent,
} from '../../../common/events/admin.events.ts';

/**
 * WHAT CONSUMES THE PRIVILEGED-ACCESS EVENTS.
 *
 * WHY A CONSUMER EXISTS AT ALL. The three events were emitted and NOT
 * registered, so every role assignment, every revocation and every break-glass
 * had been written to the dead-letter queue instead of being delivered. The
 * schemas closed that. But "delivered" is only half of a promise: an event
 * nobody listens to is an event that goes nowhere, and the commit that
 * registered the schemas described them as events that "now go somewhere".
 * This is the somewhere.
 *
 * AND WHY THE CONSUMER IS A LOG AND NOT A WRITE. The admin module already
 * writes an audit ROW for each of these three moments — that is the record
 * of what happened. This handler is the AMBULATORY half: the same fact in the
 * deployment's own logs, where an operator's alerting, a SIEM, or a log
 * pipeline can see it without a database query, and where a grant, a
 * revocation and a break-glass sit next to each other in time.
 *
 * The three are logged at DIFFERENT LEVELS, and the level is the point:
 *
 *   · an ASSIGNMENT is a grant of power, and a grant is routine. It is logged,
 *     with who granted it, to whom, and why.
 *   · a REVOCATION is the moment power is taken back, which is what an
 *     operator asks about when an account misbehaves afterwards.
 *   · a BREAK-GLASS is an EMERGENCY override: a role granted outside the
 *     normal route, for a short window, by the person who needed it. It is
 *     logged as a warning, with the window it is in force for, because it is
 *     the one of the three that is a surprise to everybody including the
 *     person who invoked it.
 *
 * WHY NOTHING HERE CAN THROW. A handler that throws inside the event emitter
 * takes down the emitter's dispatch for the other handlers of that event, and
 * the role has ALREADY been changed by the time the event is emitted. So the
 * logging is best-effort by construction: it is a `log`, not a `write`, and
 * the audit row in the admin module remains the record of what happened.
 */
@Injectable()
export class AdminPrivilegedAccessEventHandler {
  constructor(private readonly logger: WinstonLoggerService) {}

  @OnEvent('admin_role.assigned')
  handleRoleAssigned(event: AdminRoleAssignedEvent): void {
    this.logger.info(
      `Privileged access GRANTED: role "${event.adminRole}" to user ${event.userId}, ` +
        `granted by ${event.assignedBy}. Reason: ${event.reason}.` +
        (event.expiresAt ? ` Expires at ${event.expiresAt}.` : ' No expiry.'),
      'AdminPrivilegedAccess',
    );
  }

  @OnEvent('admin_role.revoked')
  handleRoleRevoked(event: AdminRoleRevokedEvent): void {
    this.logger.info(
      `Privileged access REVOKED: role "${event.adminRole}" from user ${event.userId}, ` +
        `revoked by ${event.revokedBy}. Reason: ${event.reason}.`,
      'AdminPrivilegedAccess',
    );
  }

  @OnEvent('admin_role.break_glass')
  handleBreakGlass(event: AdminRoleBreakGlassEvent): void {
    this.logger.warn(
      `BREAK-GLASS: role "${event.adminRole}" invoked by ${event.invokedBy} for user ` +
        `${event.userId}, in force for ${event.durationMinutes} minutes (until ${event.expiresAt}). ` +
        `Reason: ${event.reason}.`,
      'AdminPrivilegedAccess',
    );
  }
}
