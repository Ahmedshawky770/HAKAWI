import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  UserRegisteredSchema,
  UserUpdatedSchema,
  StoryCreatedSchema,
  StoryPublishedSchema,
  FollowCreatedSchema,
  ReactionCreatedSchema,
  CommentCreatedSchema,
  CommentReactionCreatedSchema,
  NotificationCreatedSchema,
  MessageSentSchema,
  EmailVerifiedSchema,
  PasswordResetRequestedSchema,
  ContestCompletedSchema,
  SubmissionSubmittedSchema,
  VoteCastSchema,
  WinnerSelectedSchema,
  PrizeDistributedSchema,
  BookCreatedSchema,
  PaymentInitiatedSchema,
  PaymentCompletedSchema,
  RentalCreatedSchema,
  RentalExtendedSchema,
  LibraryItemAddedSchema,
  ModerationActionTakenSchema,
  ModerationEscalatedSchema,
  AdminRoleAssignedSchema,
  AdminRoleRevokedSchema,
  AdminRoleBreakGlassSchema,
  EVENT_SCHEMAS,
  REGISTERED_WITHOUT_PRODUCER,
} from './event-schemas.ts';
import {
  AdminRoleAssignedEvent,
  AdminRoleRevokedEvent,
  AdminRoleBreakGlassEvent,
} from './admin.events.ts';

/**
 * Walks `backend/src` and returns every `.ts` file that is neither a spec nor a declaration.
 *
 * Reading the producers off disk rather than maintaining a hand-written list is the point:
 * the `moderation.escalated` defect existed because the registry and the producers were two
 * independent inventories that only a human compared. A list checked against itself proves
 * nothing; this enumeration cannot drift from what the code actually emits.
 */
function productionSourceFiles(): string[] {
  const srcRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts') || entry.name.endsWith('.d.ts')) {
        continue;
      }
      found.push(path);
    }
  };

  walk(srcRoot);
  return found;
}

/**
 * Event names published through `EventValidatorService`, which every module injects as
 * `eventBus`.
 *
 * The receiver name is the filter that separates domain events from the socket channel.
 * `messages.gateway.ts` publishes `user.online`, `user.typing`, `message.received` and
 * friends straight onto a socket with `this.server.emit(...)`; those never reach the
 * registry, they never reach the DLQ, and they have no payload contract here. Matching on
 * `eventBus` is what keeps them out of the inventory.
 */
function emittedEventNames(): Map<string, string[]> {
  const pattern = /\beventBus\s*\.\s*emit[A-Za-z]*\(\s*'([^']+)'/g;
  const sites = new Map<string, string[]>();

  for (const file of productionSourceFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) {
      const eventName = match[1];
      if (eventName === undefined) {
        continue;
      }
      const line = source.slice(0, match.index).split('\n').length;
      const site = `${file.split('/src/')[1] ?? file}:${line}`;
      sites.set(eventName, [...(sites.get(eventName) ?? []), site]);
    }
  }

  return sites;
}

/** Names claimed by a `@OnEvent` subscriber, with the file that claims each one. */
function subscribedEventNames(): Map<string, string[]> {
  const pattern = /@OnEvent\(\s*'([^']+)'/g;
  const sites = new Map<string, string[]>();

  for (const file of productionSourceFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) {
      const eventName = match[1];
      if (eventName === undefined) {
        continue;
      }
      const line = source.slice(0, match.index).split('\n').length;
      const site = `${file.split('/src/')[1] ?? file}:${line}`;
      sites.set(eventName, [...(sites.get(eventName) ?? []), site]);
    }
  }

  return sites;
}

const emitted = emittedEventNames();
const subscribed = subscribedEventNames();

describe('event-schemas', () => {
  describe('UserRegisteredSchema', () => {
    it('should validate a valid payload', () => {
      const result = UserRegisteredSchema.safeParse({ userId: '1', email: 'test@example.com', name: 'Test' });
      expect(result.success).toBe(true);
    });

    it('should reject an invalid payload', () => {
      const result = UserRegisteredSchema.safeParse({ userId: '1', email: 'invalid', name: 'Test' });
      expect(result.success).toBe(false);
    });
  });

  describe('StoryCreatedSchema', () => {
    it('should validate a valid payload', () => {
      const result = StoryCreatedSchema.safeParse({ storyId: '1', authorId: '2' });
      expect(result.success).toBe(true);
    });

    it('should reject a missing field', () => {
      const result = StoryCreatedSchema.safeParse({ storyId: '1' });
      expect(result.success).toBe(false);
    });
  });

  describe('StoryPublishedSchema', () => {
    it('should validate a payload with a Date', () => {
      const result = StoryPublishedSchema.safeParse({ storyId: '1', publishedAt: new Date() });
      expect(result.success).toBe(true);
    });

    it('should validate a payload with an ISO date string', () => {
      const result = StoryPublishedSchema.safeParse({ storyId: '1', publishedAt: new Date().toISOString() });
      expect(result.success).toBe(true);
    });
  });

  describe('CommentCreatedSchema', () => {
    it('should validate a payload with optional parentId', () => {
      const result = CommentCreatedSchema.safeParse({ commentId: '1', storyId: '2', authorId: '3' });
      expect(result.success).toBe(true);
    });

    it('should validate a payload with parentId', () => {
      const result = CommentCreatedSchema.safeParse({ commentId: '1', storyId: '2', authorId: '3', parentId: '4' });
      expect(result.success).toBe(true);
    });
  });

  describe('ContestCompletedSchema', () => {
    it('should validate a payload with null winnerId', () => {
      const result = ContestCompletedSchema.safeParse({ contestId: '1', winnerId: null });
      expect(result.success).toBe(true);
    });

    it('should validate a payload with a winnerId', () => {
      const result = ContestCompletedSchema.safeParse({ contestId: '1', winnerId: '2' });
      expect(result.success).toBe(true);
    });
  });

  describe('ModerationEscalatedSchema', () => {
    it('should accept the payload moderation.service emits', () => {
      const result = ModerationEscalatedSchema.safeParse({
        reportId: 'report-1',
        targetId: 'target-1',
        previousStatus: 'open',
        previousUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      expect(result.success).toBe(true);
    });

    it('should reject an escalation without the previous audit fields', () => {
      const result = ModerationEscalatedSchema.safeParse({ reportId: 'report-1', targetId: 'target-1' });
      expect(result.success).toBe(false);
    });
  });

  /**
   * THE PRIVILEGED-ACCESS EVENTS.
   *
   * WHY THESE ARE CHECKED AGAINST THE PRODUCER'S OWN CLASS. `AdminRolesService`
   * emits these three through `EventValidatorService`, and that service
   * REFUSES to deliver a name that is not registered in `EVENT_SCHEMAS` — the
   * payload is dead-lettered instead. The three names were not registered, so
   * every role grant, every revocation and every break-glass had been written
   * to the dead-letter queue and lost, while the audit row existed and the
   * reader's role had changed.
   *
   * The payload here is built with the SAME CLASS the service constructs, so
   * this case fails if a field is added to the event and the schema is not
   * taught about it. A test that copied the payload field by field would have
   * kept passing through exactly that change.
   */
  describe('the admin-role events', () => {
    it('should accept the payload admin-roles.service emits for an assignment', () => {
      const payload = new AdminRoleAssignedEvent(
        'user-1',
        'content_moderator',
        'admin-1',
        'covering the moderator leave',
        new Date('2026-06-01T00:00:00.000Z').toISOString(),
      );

      const result = AdminRoleAssignedSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should accept the payload admin-roles.service emits for a revocation', () => {
      const payload = new AdminRoleRevokedEvent('user-1', 'content_moderator', 'admin-1', 'no longer needed');

      const result = AdminRoleRevokedSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should accept the payload admin-roles.service emits for a break-glass', () => {
      const payload = new AdminRoleBreakGlassEvent(
        'user-1',
        'financial_officer',
        'user-1',
        'an incident needed the role',
        new Date('2026-05-01T00:15:00.000Z').toISOString(),
        15,
      );

      const result = AdminRoleBreakGlassSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should read an expiresAt that came back from the dead-letter queue as a string', () => {
      // A replayed payload has been through JSON, so its timestamp is a string
      // again. A schema that only accepted a Date would refuse to replay the
      // very events it had parked.
      const result = AdminRoleAssignedSchema.safeParse({
        userId: 'user-1',
        adminRole: 'content_moderator',
        assignedBy: 'admin-1',
        reason: 'covering the moderator leave',
        expiresAt: '2026-06-01T00:00:00.000Z',
      });

      expect(result.success).toBe(true);
    });

    it('should refuse an assignment that does not say who granted it', () => {
      const result = AdminRoleAssignedSchema.safeParse({
        userId: 'user-1',
        adminRole: 'content_moderator',
        reason: 'covering the moderator leave',
        expiresAt: '2026-06-01T00:00:00.000Z',
      });

      expect(result.success).toBe(false);
    });

    /**
     * A NULL EXPIRY IS NOT THE EPOCH.
     *
     * `z.coerce.date()` turns `null` into the EPOCH — `new Date(null)` is
     * 1970-01-01 — and it turns `undefined` into an invalid date, which Zod
     * rejects. So a break-glass whose `expiresAt` was null was accepted as a
     * grant that expired fifty-five years ago: a break-glass that reads as
     * expired is a grant nobody can use, and a consumer that only asks "is
     * this still in force" would say no to a role the operator believes they
     * hold for the next fifteen minutes.
     */
    it('should refuse a break-glass whose expiry is null', () => {
      const result = AdminRoleBreakGlassSchema.safeParse({
        userId: 'user-1',
        adminRole: 'financial_officer',
        invokedBy: 'user-1',
        reason: 'an incident needed the role',
        expiresAt: null,
        durationMinutes: 15,
      });

      expect(result.success).toBe(false);
    });

    it('should refuse a break-glass whose expiry is missing', () => {
      const result = AdminRoleBreakGlassSchema.safeParse({
        userId: 'user-1',
        adminRole: 'financial_officer',
        invokedBy: 'user-1',
        reason: 'an incident needed the role',
        durationMinutes: 15,
      });

      expect(result.success).toBe(false);
    });

    it('should still accept an assignment with no expiry at all', () => {
      // An ordinary grant does not expire, and "no expiry" is a different
      // fact from "an expiry of the epoch". The assignment's expiry is
      // nullable, and the null stays a null.
      const result = AdminRoleAssignedSchema.safeParse({
        userId: 'user-1',
        adminRole: 'content_moderator',
        assignedBy: 'admin-1',
        reason: 'covering the moderator leave',
        expiresAt: null,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('EVENT_SCHEMAS', () => {
    it('should have version v1 for all schemas', () => {
      for (const entry of Object.values(EVENT_SCHEMAS)) {
        expect(entry.version).toBe('v1');
      }
    });

    it('should register a schema for every event name the codebase emits', () => {
      const unregistered = [...emitted.keys()]
        .filter((eventName) => !(eventName in EVENT_SCHEMAS))
        .map((eventName) => `${eventName} (emitted at ${(emitted.get(eventName) ?? []).join(', ')})`)
        .sort();

      expect(unregistered).toEqual([]);
    });

    it('should register a schema for every name an @OnEvent handler claims', () => {
      const unregistered = [...subscribed.keys()]
        .filter((eventName) => !(eventName in EVENT_SCHEMAS))
        .map((eventName) => `${eventName} (subscribed at ${(subscribed.get(eventName) ?? []).join(', ')})`)
        .sort();

      expect(unregistered).toEqual([]);
    });

    it('should carry no registration without a producer that is not on the documented list', () => {
      const orphans = Object.keys(EVENT_SCHEMAS)
        .filter((eventName) => !emitted.has(eventName))
        .filter((eventName) => !REGISTERED_WITHOUT_PRODUCER.includes(eventName))
        .sort();

      expect(orphans).toEqual([]);
    });

    it('should still register every name on the documented producer-less list', () => {
      for (const eventName of REGISTERED_WITHOUT_PRODUCER) {
        expect(EVENT_SCHEMAS[eventName]).toBeDefined();
      }
    });

    it('should not keep a name on the documented producer-less list once it has a producer', () => {
      const alreadyProduced = REGISTERED_WITHOUT_PRODUCER.filter((eventName) => emitted.has(eventName));

      expect(alreadyProduced).toEqual([]);
    });

    it('should not keep a registration that no producer and no handler ever names', () => {
      const untouched = Object.keys(EVENT_SCHEMAS)
        .filter((eventName) => !emitted.has(eventName))
        .filter((eventName) => !subscribed.has(eventName))
        .sort();

      expect(untouched).toEqual([]);
    });

    it('should register the escalation name under the spelling its producers emit', () => {
      // `moderation.escalated` was registered while four call sites emitted
      // `moderation.report.escalated`, so every escalation was dead-lettered.
      expect(EVENT_SCHEMAS['moderation.report.escalated']).toBeDefined();
      expect(EVENT_SCHEMAS['moderation.escalated']).toBeUndefined();
    });

    it('should register exactly one name for each follow, reaction and comment reaction fact', () => {
      // The two-spellings pairs are aliases of one another; only the emitted spelling survives.
      expect(Object.keys(EVENT_SCHEMAS).filter((name) => name.startsWith('follow.'))).toEqual([]);
      expect(Object.keys(EVENT_SCHEMAS).filter((name) => name.startsWith('reaction.'))).toEqual([]);
      expect(Object.keys(EVENT_SCHEMAS).filter((name) => name.startsWith('comment_reaction.'))).toEqual([]);
    });
  });
});
