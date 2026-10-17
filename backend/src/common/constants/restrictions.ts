/**
 * The account restriction vocabulary, as the ENFORCEMENT side spells it.
 *
 * WHY THESE TWO CONSTANTS LIVE HERE. `RestrictionGuard` already carried the literals `'ban'` and
 * `'mute'` inline, and the auth flows needed a third copy to answer "does this account have a ban?".
 * Three spellings of one vocabulary is how a rename in one of them becomes a silent bypass in the
 * others (Principle #9), so the enforcement-side values are named once, here.
 *
 * WHY THIS IS NOT A RE-IMPORT OF `moderation/restriction-policy.ts`. That file is the PRODUCER side
 * — it maps a moderator's chosen action onto the stored value — and it lives in a module that depends
 * on `common/`. Importing it from here would invert the dependency direction the module boundaries
 * are built on. This constant is the contract the enforcement side reads; the producer writes exactly
 * these values through `RESTRICTION_TYPE_BY_ACTION`. If that map ever changes, the two must change
 * together, and the values are only two and only meaningfully distinct.
 */
export const RESTRICTION_TYPE_BAN = 'ban';
export const RESTRICTION_TYPE_MUTE = 'mute';

/**
 * The cache key `ModerationEventHandler` writes for every account-level restriction, with the TTL
 * from `moderation/restriction-policy.ts`.
 *
 * Both readers of this key — `RestrictionGuard` and `AuthService` — build it through this function.
 * The producer still spells the same literal itself, because `common/` must not reach into a module;
 * the divergence this removes is between the two READERS, which is what actually decided whether a
 * ban was enforced.
 */
export function restrictionCacheKey(userId: string): string {
  return `restriction:${userId}`;
}
