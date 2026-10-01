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
  EVENT_SCHEMAS,
  REGISTERED_WITHOUT_PRODUCER,
} from './event-schemas.ts';

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
