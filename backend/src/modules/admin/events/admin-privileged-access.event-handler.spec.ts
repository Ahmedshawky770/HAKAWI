import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import {
  AdminRoleAssignedEvent,
  AdminRoleRevokedEvent,
  AdminRoleBreakGlassEvent,
} from '../../../common/events/admin.events.ts';

import { AdminPrivilegedAccessEventHandler } from './admin-privileged-access.event-handler.ts';

/**
 * THE CONSUMER OF THE PRIVILEGED-ACCESS EVENTS.
 *
 * The three events were emitted and NOT registered, so every role assignment,
 * every revocation and every break-glass had been written to the dead-letter
 * queue instead of being delivered. The schemas closed that — and "delivered"
 * is only half of a promise: an event nobody listens to goes nowhere.
 *
 * So the events are consumed, and the consumption is a LOG: the admin module
 * already writes the audit ROW, and this is the same fact in the deployment's
 * own logs, where an operator's alerting can see it without a database query.
 *
 * The LEVEL is the point, and it is the only thing these cases pin:
 *
 *   · a GRANT is routine, and is logged as information;
 *   · a REVOCATION is what an operator asks about when an account misbehaves
 *     afterwards, and is logged as information too;
 *   · a BREAK-GLASS is an EMERGENCY override — a role granted outside the
 *     normal route, for a short window — and is logged as a WARNING, with the
 *     window it is in force for.
 */
describe("AdminPrivilegedAccessEventHandler", () => {
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  let handler: AdminPrivilegedAccessEventHandler;

  beforeEach(() => {
    logger = { info: vi.fn(), warn: vi.fn() };
    handler = new AdminPrivilegedAccessEventHandler(logger as unknown as WinstonLoggerService);
  });

  it("logs a grant with who granted it, to whom, and why", () => {
    handler.handleRoleAssigned(
      new AdminRoleAssignedEvent(
        "user-1",
        "content_moderator",
        "admin-1",
        "covering the moderator leave",
        "2026-06-01T00:00:00.000Z",
      ),
    );

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [message] = logger.info.mock.calls[0] as [string, string];
    expect(message).toContain("content_moderator");
    expect(message).toContain("user-1");
    expect(message).toContain("admin-1");
    expect(message).toContain("covering the moderator leave");
    expect(message).toContain("2026-06-01T00:00:00.000Z");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("says when a grant does not expire", () => {
    handler.handleRoleAssigned(
      new AdminRoleAssignedEvent("user-1", "content_moderator", "admin-1", "permanent", null),
    );

    const [message] = logger.info.mock.calls[0] as [string, string];
    expect(message).toContain("No expiry");
  });

  it("logs a revocation with who took the role back, and why", () => {
    handler.handleRoleRevoked(
      new AdminRoleRevokedEvent("user-1", "content_moderator", "admin-1", "the account misbehaved"),
    );

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [message] = logger.info.mock.calls[0] as [string, string];
    expect(message).toContain("REVOKED");
    expect(message).toContain("the account misbehaved");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs a break-glass as a warning, with the window it is in force for", () => {
    handler.handleBreakGlass(
      new AdminRoleBreakGlassEvent(
        "user-1",
        "financial_officer",
        "user-1",
        "an incident needed the role",
        "2026-05-01T00:15:00.000Z",
        15,
      ),
    );

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [message] = logger.warn.mock.calls[0] as [string, string];
    expect(message).toContain("BREAK-GLASS");
    expect(message).toContain("financial_officer");
    expect(message).toContain("15 minutes");
    expect(message).toContain("2026-05-01T00:15:00.000Z");
    // A break-glass is never an ordinary grant, so it never goes out as one.
    expect(logger.info).not.toHaveBeenCalled();
  });
});
