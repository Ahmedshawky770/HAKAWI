import { describe, it, expect } from 'vitest';
import { z } from 'zod';

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
  ContestCreatedSchema,
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
  UserRestrictedSchema,
  ModerationEscalatedSchema,
  EVENT_SCHEMAS,
} from './event-schemas.ts';

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

  describe('UserRestrictedSchema', () => {
    it('should validate a payload with null expiresAt', () => {
      const result = UserRestrictedSchema.safeParse({ userId: '1', type: 'ban', reason: 'spam', restrictedBy: '2', expiresAt: null });
      expect(result.success).toBe(true);
    });
  });

  describe('EVENT_SCHEMAS', () => {
    it('should contain all required event schemas', () => {
      const requiredEvents = [
        'user.registered',
        'user.updated',
        'user.deleted',
        'story.created',
        'story.updated',
        'story.published',
        'story.archived',
        'story.deleted',
        'follow.created',
        'follow.deleted',
        'reaction.created',
        'reaction.deleted',
        'comment.created',
        'comment.updated',
        'comment.deleted',
        'comment_reaction.created',
        'comment_reaction.deleted',
        'notification.created',
        'notification.read',
        'notification.deleted',
        'message.sent',
        'message.read',
        'email.verified',
        'email.verification.requested',
        'password.reset.requested',
        'password.reset.completed',
        'contest.created',
        'contest.updated',
        'contest.started',
        'contest.completed',
        'contest.cancelled',
        'submission.submitted',
        'submission.approved',
        'submission.rejected',
        'vote.cast',
        'winner.selected',
        'prize.distributed',
        'book.created',
        'book.updated',
        'book.published',
        'book.archived',
        'book.deleted',
        'payment.initiated',
        'payment.completed',
        'payment.failed',
        'payment.refunded',
        'rental.created',
        'rental.extended',
        'rental.returned',
        'rental.expired',
        'library.item.added',
        'library.item.accessed',
        'library.item.removed',
        'moderation.report.created',
        'moderation.action.taken',
        'user.restricted',
      ];

      for (const eventName of requiredEvents) {
        expect(EVENT_SCHEMAS[eventName]).toBeDefined();
      }
    });

    it('should have version v1 for all schemas', () => {
      for (const entry of Object.values(EVENT_SCHEMAS)) {
        expect(entry.version).toBe('v1');
      }
    });
  });
});
