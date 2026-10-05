import type { NotificationPreferencesResponseDto } from './interfaces/notifications-repository.interface.ts';

/**
 * WHICH PREFERENCE GOVERNS WHICH NOTIFICATION TYPE.
 *
 * `notification_preferences` stores one boolean per family, and the family a notification belongs to is
 * a property of its type, not of whoever happened to raise it: a follow, a reaction on a comment and a
 * reaction on a story are raised by three different modules and all arrive here. Resolving the family
 * is therefore a property of the notification, and it is resolved in exactly one place.
 *
 * WHY THIS LIVES IN ITS OWN FILE RATHER THAN IN `NotificationsService`. `NotificationsService.create`
 * consults this map, and `NotificationsEmailService.sendNotificationEmail` used to carry a SECOND copy
 * of it — `typePreferenceMap` — that had already drifted: it had no `comment_reply`, no `contest` and
 * no `payment`. So a user who muted replies still got the reply by email, and the two copies had to be
 * edited together forever to stay correct. Two maps that must agree is the same defect as two routes
 * that must agree (Principle #9), and it is now one map read through one resolver.
 *
 * WHY `comment_reaction` EXISTS AS ITS OWN TYPE. `handleCommentReacted` used to write
 * `story_reaction`, so a reaction to a COMMENT resolved to the `storyReactions` preference. The
 * consequence ran in both directions and neither was what the user asked for: someone who turned
 * *comment* notifications off was still notified about reactions to their comments, and someone who
 * turned *story* reactions off was still notified about comments. The family is derived from the
 * type string, so a wrong type string cannot be mapped to the right family — the type itself is the
 * bug, and `comment_reaction` is the smallest correction that makes the mapping tell the truth.
 *
 * `comment_reaction` is deliberately NOT added to `NOTIFICATION_TYPES` in
 * `packages/shared-types/src/social.ts`; that package is outside this change's file ownership, and
 * nothing reads that list — `Notification.type` is a plain `string` and `isNotificationType` has no
 * caller. The omission is a reporting item, not a break.
 *
 * WHY A TYPE WITH NO ENTRY IS STILL DELIVERED. `contest.created`, `winner.selected`,
 * `prize.distributed` and `badge.awarded` are not in `NOTIFICATION_TYPES` and have no column behind
 * them. Dropping them would make badge awards and contest announcements structurally invisible, which
 * is the defect `BadgesService.announceAward` exists to fix. No entry therefore means "no preference
 * governs this", not "suppress".
 *
 * WHY `message` HAS ITS OWN FAMILY RATHER THAN BORROWING `system`. `message` had NO entry at all, and
 * `notification_preferences` had no column for it, so a direct message was un-silenceable: the gate had
 * nothing to consult, the PATCH had nothing to accept, and a user who wanted a quiet inbox had no
 * mechanism at all for the one kind of notification that is addressed to them personally. Mapping it to
 * `system` — the family a contest announcement already resolves to — would have been a cheaper fix and
 * the wrong one: turning `system` off also silences prize payments and badge awards, which is a different
 * request than "stop telling me someone wrote to me". Migration 0023 added the `messages` column for it.
 */
export const PREFERENCE_FOR_TYPE: Readonly<Record<string, keyof NotificationPreferencesResponseDto>> = {
  follow: 'follows',
  story_reaction: 'storyReactions',
  // A reaction to a comment is a comment notification. It sat under `storyReaction` before, which is
  // exactly the bug this map's doc describes.
  comment_reaction: 'comments',
  comment: 'comments',
  comment_reply: 'comments',
  mention: 'mentions',
  // Spelled `message` as a TYPE and `messages` as the COLUMN, the same way `story_reaction` maps to
  // `storyReactions`: the map keys on the type string every producer writes and names the column
  // behind it, so neither has to be renamed for the other to keep working.
  message: 'messages',
  contest: 'system',
  payment: 'system',
  system: 'system',
};

/**
 * The family that governs `type`, or `undefined` when no preference governs it.
 *
 * `undefined` is a real answer and both call sites must keep treating it as "deliver, do not consult
 * the preferences table" — reading it as "suppress" would hide every badge award and contest notice in
 * the product.
 */
export function preferenceForType(type: string): keyof NotificationPreferencesResponseDto | undefined {
  return PREFERENCE_FOR_TYPE[type];
}
