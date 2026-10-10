import { describe, it, expect } from 'vitest';

import { PREFERENCE_FOR_TYPE, preferenceForType } from './preference-family.ts';

/**
 * This map is the Single Source of Truth for "which preference governs which notification type"
 * (Principle #9). It used to live in `NotificationsService` while a second, already-diverged copy lived
 * in `NotificationsEmailService`, so these cases are the contract both delivery paths now share.
 */
describe('preferenceForType', () => {
  it('should govern a follow by the follows preference', () => {
    expect(preferenceForType('follow')).toBe('follows');
  });

  it('should govern a story reaction by the storyReactions preference', () => {
    expect(preferenceForType('story_reaction')).toBe('storyReactions');
  });

  // The C3 defect: a reaction to a comment was written as `story_reaction`, so it resolved here to
  // `storyReactions` and a user who had muted COMMENTS was still notified about reactions to their own
  // comments — while a user who had muted STORY reactions could not be spared from comment ones.
  it('should govern a comment reaction by the comments preference, not storyReactions', () => {
    expect(preferenceForType('comment_reaction')).toBe('comments');
  });

  it('should keep a comment reaction and a story reaction on different families', () => {
    expect(preferenceForType('comment_reaction')).not.toBe(preferenceForType('story_reaction'));
  });

  it('should govern comments, replies and comment reactions by the same family', () => {
    expect(preferenceForType('comment')).toBe('comments');
    expect(preferenceForType('comment_reply')).toBe('comments');
    expect(preferenceForType('comment_reaction')).toBe('comments');
  });

  it('should govern mentions, contests, payments and system notices by their own families', () => {
    expect(preferenceForType('mention')).toBe('mentions');
    expect(preferenceForType('contest')).toBe('system');
    expect(preferenceForType('payment')).toBe('system');
    expect(preferenceForType('system')).toBe('system');
  });

  // A direct message had NO entry here, and `notification_preferences` had no column behind it, so there
  // was nothing for `NotificationsService.create` to consult and nothing for the PATCH to store: a
  // recipient could not silence a message by any means. Migration 0023 added the `messages` column, and
  // this map is what makes it reachable.
  it('should govern a direct message by the messages preference', () => {
    expect(preferenceForType('message')).toBe('messages');
  });

  // The point of a family of its own rather than a reuse of `system`: muting system notices must not
  // silence a message, and muting messages must not silence a contest announcement or a prize payment.
  it('should keep a message off the system family in both directions', () => {
    expect(preferenceForType('message')).not.toBe('system');
    expect(preferenceForType('contest')).not.toBe('messages');
    expect(preferenceForType('payment')).not.toBe('messages');
  });

  // `undefined` is a real answer, and both callers must keep reading it as "no preference governs
  // this" rather than "suppress". Reading it as "suppress" would hide every badge award and every
  // contest notice in the product.
  it('should return undefined for a type no preference governs', () => {
    expect(preferenceForType('badge.awarded')).toBeUndefined();
    expect(preferenceForType('contest.created')).toBeUndefined();
    expect(preferenceForType('winner.selected')).toBeUndefined();
    expect(preferenceForType('prize.distributed')).toBeUndefined();
  });

  it('should never resolve to the transport-level preferences', () => {
    // `emailEnabled` and `pushEnabled` are channels, not content families. Mapping a notification type
    // onto one of them would let a content preference switch a transport off.
    for (const family of Object.values(PREFERENCE_FOR_TYPE)) {
      expect(family).not.toBe('emailEnabled');
      expect(family).not.toBe('pushEnabled');
    }
  });
});
