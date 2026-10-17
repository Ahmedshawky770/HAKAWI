/**
 * WHAT AN ACCOUNT RESTRICTION MEANS AND HOW LONG IT LASTS — decided in one place.
 *
 * WHY THIS FILE EXISTS. The moderator's chosen duration used to be honoured by one store and ignored
 * by the other. `ModerationService.takeAction` wrote `user_restrictions.expires_at` as
 * `now + durationMinutes`, and `ModerationEventHandler` wrote the enforcement key
 * `restriction:<userId>` with a fixed TTL — a ban always died in a day, every other restriction in
 * thirty days. `RestrictionGuard` reads Valkey only, so a seven-day ban stopped being enforced after
 * twenty-four hours while the row it came from still claimed a week: the duration the moderator
 * chose was the duration the audit trail displayed and not the duration that was enforced.
 *
 * The two stores also disagreed about what an action MEANT. The service had always normalised the
 * action into the table's vocabulary — `ban`, `mute`, or `warning` — while the handler wrote the raw
 * action into Valkey, so `restriction:<userId>` held `'warn'` for a warned account. That mismatch is
 * why the guard could not simply be wired up as written: a guard that treats any present key as a
 * denial would have turned every warning, every content removal and every no-op decision into a
 * total account lockout.
 *
 * Both stores now read their vocabulary and their lifetime from here, so they agree by construction
 * rather than by two separate edits being kept in step. `ModerationService` is the single writer of
 * `user_restrictions`; the handler is the single writer of the cache, and nothing else decides a TTL.
 */

/**
 * The stored restriction vocabulary, keyed by the action that produces it.
 *
 * `ModerationActionDto.action` is `'warn' | 'mute' | 'ban' | 'content_removal' | 'no_action'`, and
 * only two of those restrict an account: a `warn` is a note to the user, `content_removal` is a
 * decision about one piece of content, and `no_action` is the absence of a decision. Treating any of
 * them as a restriction would be a denial of service dressed as moderation.
 *
 * Kept as an explicit map rather than a cast so that an action name added to `ModerationActionDto`
 * without a decision here resolves to `undefined` — a value no consumer treats as a restriction —
 * instead of being written through unchanged. An action that is not in this map is therefore never
 * cached as a restriction, which is the direction a control whose worst error is "a restricted user
 * can still read" must fail in. `restrictionTypeForAction` answers the table's question instead,
 * where a non-restriction is recorded as `warning` because the column has always used that word for
 * "not a ban and not a mute".
 */
export const RESTRICTION_TYPE_BY_ACTION: Readonly<Record<string, string>> = {
  ban: 'ban',
  mute: 'mute',
};

/**
 * The `user_restrictions.type` value for `action`, with the table's own default for everything else.
 *
 * The service writes the row, so it needs a value for every action it records — including the three
 * that restrict nothing. The handler needs the opposite question ("does this action restrict the
 * account at all?") and asks it of the map directly, which is why the two are not one function.
 */
export function restrictionTypeForAction(action: string): string {
  return RESTRICTION_TYPE_BY_ACTION[action] ?? 'warning';
}

/** A ban expires in a day; every other restriction is treated as a month. */
export const BAN_TTL_SECONDS = 24 * 60 * 60;
export const OTHER_RESTRICTION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * How long a restriction lasts, in seconds — the single answer both stores read.
 *
 * WHY THE DURATION WINS. `durationMinutes` is the moderator's decision and the only number that
 * describes the case in front of them, so a positive integer duration is what gets enforced. The
 * defaults below are the fallback for an action recorded without one — a restriction that has to
 * expire somehow rather than forever, which is the behaviour the fixed TTLs used to impose on every
 * action unconditionally.
 *
 * WHY THE VALUE IS VALIDATED RATHER THAN TRUSTED. `ModerationActionDto` already rejects a
 * non-positive or fractional duration, so a rejection here is unreachable through the API. The check
 * exists because the same function serves the event bus, where the payload arrives from JSON: a
 * `0`, a `-1` or a `1.5` from a replayed or hand-written event would otherwise compute a TTL in the
 * past — an instantly expired restriction, enforced nowhere — or a nonsensical one.
 */
export function restrictionTtlSeconds(action: string, durationMinutes?: number | null): number {
  if (
    durationMinutes !== undefined &&
    durationMinutes !== null &&
    Number.isInteger(durationMinutes) &&
    durationMinutes > 0
  ) {
    return durationMinutes * 60;
  }

  return action === 'ban' ? BAN_TTL_SECONDS : OTHER_RESTRICTION_TTL_SECONDS;
}
